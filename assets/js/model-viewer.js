let scene, camera, renderer, controls;
let currentMode = 'orbit';
let measurementMode = 'none';
let selectedPoints = [];
let measurementLine;
let measurementText;
let dynamicLine; // For showing line while measuring
let pointMarkers = []; // For showing selected points
let polygonPoints = [];
let polygonLines = [];
let firstPointMarker = null;
let currentModel = null;

function disposeNode(node) {
    if (node.geometry) {
        node.geometry.dispose();
    }
    
    if (node.material) {
        if (node.material.map) node.material.map.dispose();
        if (node.material.lightMap) node.material.lightMap.dispose();
        if (node.material.bumpMap) node.material.bumpMap.dispose();
        if (node.material.normalMap) node.material.normalMap.dispose();
        if (node.material.specularMap) node.material.specularMap.dispose();
        if (node.material.envMap) node.material.envMap.dispose();
        node.material.dispose();
    }
}

function init(modelPath) {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Container and camera setup
    const container = document.getElementById('viewer-container');
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Controls setup
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.panSpeed = 1.0;
    controls.enableZoom = true;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.DOLLY
    };

    // Load GLB model
    const loader = new THREE.GLTFLoader();
    loader.load(
        modelPath,
        function(gltf) {
            const model = gltf.scene;
                scene.add(model);
                
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                
                const fov = camera.fov * (Math.PI / 180);
                const cameraZ = Math.abs(maxDim / Math.sin(fov / 2) / 2);
                camera.position.z = cameraZ;
                
                controls.target.copy(center);
                controls.update();
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('Error loading model:', error);
        }
    );

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    // Add all event listeners here
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            cancelMeasurement();
        }
    });
    renderer.domElement.addEventListener('click', onModelClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    animate();
}

// Viewing mode controls
function setOrbitMode() {
    currentMode = 'orbit';
    measurementMode = 'none';
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
}

function setPanMode() {
    currentMode = 'pan';
    measurementMode = 'none';
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
}

function setZoomMode() {
    currentMode = 'zoom';
    measurementMode = 'none';
    controls.mouseButtons.LEFT = THREE.MOUSE.DOLLY;
}

// Measurement controls
function toggleMeasureMenu() {
    const menu = document.getElementById('measureMenu');
    menu.classList.toggle('show');
}

function setDistanceMeasure() {
    measurementMode = 'distance';
    currentMode = 'measure';
    selectedPoints = [];
    clearMeasurement();
    toggleMeasureMenu();
}

function setAngleMeasure() {
    measurementMode = 'angle';
    currentMode = 'measure';
    selectedPoints = [];
    clearMeasurement();
    toggleMeasureMenu();
}

function setAreaMeasure() {
    measurementMode = 'area';
    currentMode = 'measure';
    polygonPoints = [];
    polygonLines = [];
    firstPointMarker = null;
    clearMeasurement();
    toggleMeasureMenu();
}

function updateAreaPolygon(currentPoint) {
    // Remove previous dynamic line
    if (dynamicLine) scene.remove(dynamicLine);

    if (polygonPoints.length > 0) {
        // Draw line from last point to current mouse position
        const points = [polygonPoints[polygonPoints.length - 1], currentPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        dynamicLine = new THREE.Line(geometry, material);
        scene.add(dynamicLine);

        // If near first point, show connection to it instead
        if (firstPointMarker && currentPoint.distanceTo(polygonPoints[0]) < 0.5) {
            const closePoints = [polygonPoints[polygonPoints.length - 1], polygonPoints[0]];
            const closeGeometry = new THREE.BufferGeometry().setFromPoints(closePoints);
            if (dynamicLine) scene.remove(dynamicLine);
            dynamicLine = new THREE.Line(closeGeometry, material);
            scene.add(dynamicLine);
        }
    }
}

function calculatePolygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        // Using the 3D variant of the shoelace formula
        area += points[i].x * points[j].z - points[j].x * points[i].z;
    }
    return Math.abs(area) / 2;
}

function createPointMarker(position) {
    const geometry = new THREE.SphereGeometry(0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    scene.add(sphere);
    pointMarkers.push(sphere);
    return sphere;
}

function clearMeasurement() {
    if (measurementLine) scene.remove(measurementLine);
    if (measurementText) scene.remove(measurementText);
    if (dynamicLine) scene.remove(dynamicLine);
    polygonLines.forEach(line => scene.remove(line));
    polygonLines = [];
    pointMarkers.forEach(marker => scene.remove(marker));
    pointMarkers = [];
}

function onModelClick(event) {
    if (measurementMode === 'none') return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const point = intersects[0].point;

        if (measurementMode === 'distance') {
            createPointMarker(point);
            selectedPoints.push(point);

            if (selectedPoints.length === 2) {
                showDistance();
                // Reset points but keep measurement mode for continuous measurements
                selectedPoints = [];
                if (dynamicLine) {
                    scene.remove(dynamicLine);
                    dynamicLine = null;
                }
            }
        } 
        else if (measurementMode === 'angle') {
            createPointMarker(point);
            selectedPoints.push(point);

            if (selectedPoints.length === 3) {
                showAngle();
                // Reset points but keep measurement mode for continuous measurements
                selectedPoints = [];
                if (dynamicLine) {
                    scene.remove(dynamicLine);
                    dynamicLine = null;
                }
            }
        }
        else if (measurementMode === 'area') {
            // Check if clicking near first point to close polygon
            if (polygonPoints.length > 2 && firstPointMarker && point.distanceTo(polygonPoints[0]) < 0.5) {
                // Complete the polygon
                const geometry = new THREE.BufferGeometry().setFromPoints([...polygonPoints, polygonPoints[0]]);
                const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                polygonLines.push(line);

                // Calculate area
                const area = calculatePolygonArea(polygonPoints) * 10000; // Convert to square centimeters

                // Calculate true centroid of polygon
                let centroidX = 0;
                let centroidZ = 0;
                let signedArea = 0;
                
                for (let i = 0; i < polygonPoints.length; i++) {
                    const j = (i + 1) % polygonPoints.length;
                    const cross = polygonPoints[i].x * polygonPoints[j].z - polygonPoints[j].x * polygonPoints[i].z;
                    signedArea += cross;
                    centroidX += (polygonPoints[i].x + polygonPoints[j].x) * cross;
                    centroidZ += (polygonPoints[i].z + polygonPoints[j].z) * cross;
                }
                signedArea /= 2;
                centroidX /= (6 * signedArea);
                centroidZ /= (6 * signedArea);

                // Create centroid point with average Y coordinate
                const avgY = polygonPoints.reduce((sum, p) => sum + p.y, 0) / polygonPoints.length;
                const centroidPoint = new THREE.Vector3(centroidX, avgY, centroidZ);

                // Display area at centroid
                const textSprite = createTextSprite(`${area.toFixed(1)} cm²`);
                textSprite.position.copy(centroidPoint);
                measurementText = textSprite;
                scene.add(textSprite);

                // Reset for next measurement
                polygonPoints = [];
                if (dynamicLine) scene.remove(dynamicLine);
                firstPointMarker = null;
            } else {
                // Add new point to polygon
                const marker = createPointMarker(point);
                if (!firstPointMarker) {
                    firstPointMarker = marker;
                }
                polygonPoints.push(point);

                // Draw line to previous point
                if (polygonPoints.length > 1) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        polygonPoints[polygonPoints.length - 2],
                        point
                    ]);
                    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
                    const line = new THREE.Line(geometry, material);
                    scene.add(line);
                    polygonLines.push(line);
                }
            }
        }
    }
}

function onMouseMove(event) {
    if (measurementMode === 'none' || 
        (measurementMode !== 'area' && selectedPoints.length === 0)) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        if (measurementMode === 'area' && polygonPoints.length > 0) {
            updateAreaPolygon(intersects[0].point);
        } else {
            updateDynamicLine(intersects[0].point);
        }
    }
}

function updateDynamicLine(currentPoint) {
    if (dynamicLine) scene.remove(dynamicLine);

    if (measurementMode === 'distance') {
        const points = [selectedPoints[0], currentPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00, dashSize: 1, gapSize: 1 });
        dynamicLine = new THREE.Line(geometry, material);
        scene.add(dynamicLine);
    } else if (measurementMode === 'angle' && selectedPoints.length === 2) {
        const points = [selectedPoints[0], selectedPoints[1], selectedPoints[0], currentPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        dynamicLine = new THREE.Line(geometry, material);
        scene.add(dynamicLine);
    }
}

function showDistance() {
    const start = selectedPoints[0];
    const end = selectedPoints[1];
    const distance = start.distanceTo(end) * 100; // Convert to centimeters

    const geometry = new THREE.BufferGeometry().setFromPoints(selectedPoints);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    measurementLine = new THREE.Line(geometry, material);
    scene.add(measurementLine);

    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const textSprite = createTextSprite(`${distance.toFixed(1)} cm`);
    textSprite.position.copy(midPoint);
    measurementText = textSprite;
    scene.add(textSprite);
}

function showAngle() {
    const vertex = selectedPoints[0];
    const point1 = selectedPoints[1];
    const point2 = selectedPoints[2];

    const vector1 = new THREE.Vector3().subVectors(point1, vertex);
    const vector2 = new THREE.Vector3().subVectors(point2, vertex);
    const angle = vector1.angleTo(vector2) * (180 / Math.PI);

    const geometry = new THREE.BufferGeometry().setFromPoints([vertex, point1, vertex, point2]);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    measurementLine = new THREE.Line(geometry, material);
    scene.add(measurementLine);

    const textSprite = createTextSprite(`${angle.toFixed(1)}°`);
    textSprite.position.copy(vertex);
    measurementText = textSprite;
    scene.add(textSprite);

    selectedPoints = [];
}

function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Make base size larger then scale down for better quality
    const fontSize = 32;  // Larger base font size
    const padding = 12;
    const borderRadius = 8;
    
    // Set font and measure
    context.font = `Bold ${fontSize}px Arial`;
    const metrics = context.measureText(message);
    
    // Set canvas size
    const textHeight = fontSize;
    canvas.width = Math.ceil(metrics.width + (padding * 2));
    canvas.height = Math.ceil(textHeight + (padding * 2));
    
    // Clear and set background
    context.fillStyle = 'white';
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    context.fill();
    
    // Draw text
    context.font = `Bold ${fontSize}px Arial`;
    context.fillStyle = '#0066cc';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(message, canvas.width/2, canvas.height/2);

    const texture = new THREE.CanvasTexture(canvas);
    // Update texture properties for better quality
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.generateMipmaps = false;
    
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Adjust scale to maintain desired size
    const scaleFactor = 0.001;  // Smaller scale factor since base size is larger
    sprite.scale.set(
        scaleFactor * canvas.width,
        scaleFactor * canvas.height,
        1
    );
    
    sprite.renderOrder = 999;
    
    return sprite;
}

function cancelMeasurement() {
    // Clear current measurement
    clearMeasurement();
    
    // Reset all measurement states
    measurementMode = 'none';
    selectedPoints = [];
    polygonPoints = [];
    firstPointMarker = null;
    
    // Remove dynamic line if exists
    if (dynamicLine) {
        scene.remove(dynamicLine);
        dynamicLine = null;
    }
    
    // Close measurement menu if open
    const menu = document.getElementById('measureMenu');
    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('viewer-container');
    const aspect = container.clientWidth / container.clientHeight;
    
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    
    renderer.setSize(container.clientWidth, container.clientHeight);
}


