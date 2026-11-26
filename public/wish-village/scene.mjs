/* The scene geometry, materials, lighting and orbit camera come from the supplied Santa Village design. */
export const shapedOrnamentLimit = 50;

const gardenBounds = { side: 37, back: -29, front: 35 };
const cabinPosition = { x: -30.5, z: -24.5 };
const plotPositions = [
    [-31, -6], [-13, -15], [-15, -25], [-5, -24], [5, -25], [15, -23], [24, -26], [34, -24],
    [-35, -13], [-26, -10], [-18, -8], [-7, -6], [5, -9], [14, -12], [24, -9], [34, -13],
    [-33, 5], [-24, 8], [-15, 5], [-5, 7], [6, 6], [15, 8], [25, 5], [35, 8],
    [-35, 17], [-26, 19], [-17, 16], [-7, 19], [5, 17], [15, 19], [24, 16], [33, 20],
    [-34, 30], [-24, 32], [-15, 27], [-5, 31], [6, 30], [16, 28], [25, 32], [35, 30],
];

export function createVillage(container, { onPick, onNear, overview }) {
    const THREE = window.THREE;
    if (!THREE) throw new Error("Three.js failed to load");

    // Assign display positions once per view. Array indices remain the stored plot IDs.
    // The admin overview uses a fixed layout so it can be consulted across visits.
    const positions = [...plotPositions];
    if (!overview) {
        for (let index = positions.length - 1; index > 0; index--) {
            const other = Math.floor(Math.random() * (index + 1));
            [positions[index], positions[other]] = [positions[other], positions[index]];
        }
    }

    const treeSlots = [];
    const plantedTrees = new Map();
    let decorationPlots = new Set();
    const moveKeys = { up: false, down: false, left: false, right: false };
    const stick = { x: 0, z: 0 };
    let enabled = false;
    let cameraZoom;
    let cameraAngle;
    let cameraPitch;
    let haloTexture;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b19);
    scene.fog = new THREE.FogExp2(0x0a1326, 0.011);
    
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 300);
    camera.position.set(0, 14, 22);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    
    // 환경 조명: 북유럽 오로라 밤하늘 반사광 & 별빛 달빛 조명
    const hemiLight = new THREE.HemisphereLight(0x6ee7b7, 0x1e293b, 0.78);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);
    
    const dirLight = new THREE.DirectionalLight(0xcbd5e1, 0.92);
    dirLight.position.set(22, 36, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 90;
    const d = 49;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    
    // 오로라 애니메이션 메쉬 & 굴뚝 연기 파티클 배열
    const auroraRibbons = [];
    const chimneySmokes = [];

    function createAuroraAndStars() {
        // 반짝이는 밤하늘 별무리
        const starCount = 900;
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.44;
            const r = 135 + Math.random() * 25;
            starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPos[i * 3 + 1] = r * Math.cos(phi) + 12;
            starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xf8fafc, size: 0.45, transparent: true, opacity: 0.85 });
        scene.add(new THREE.Points(starGeo, starMat));
    
        // 3겹으로 일렁이는 북유럽 오로라 커튼
        const ribbonConfigs = [
            { color: 0x34d399, y: 38, z: -55, width: 145, height: 18, speed: 0.9, phase: 0 },
            { color: 0x2dd4bf, y: 44, z: -68, width: 165, height: 22, speed: 0.65, phase: 2.1 },
            { color: 0xa78bfa, y: 49, z: -80, width: 180, height: 20, speed: 0.5, phase: 4.2 }
        ];
    
        ribbonConfigs.forEach(cfg => {
            const geo = new THREE.PlaneGeometry(cfg.width, cfg.height, 48, 6);
            const mat = new THREE.MeshBasicMaterial({
                color: cfg.color,
                transparent: true,
                opacity: 0.24,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, cfg.y, cfg.z);
            mesh.rotation.x = 0.28;
            scene.add(mesh);
    
            const basePos = Float32Array.from(geo.attributes.position.array);
            auroraRibbons.push({ mesh, basePos, speed: cfg.speed, phase: cfg.phase });
        });
    }
    
    function createWoodenPlank(x, z, w, d, parent, woodMat, snowMat) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), woodMat);
        plank.position.set(x, 0.05, z);
        plank.receiveShadow = true;
        plank.castShadow = true;
        parent.add(plank);
    
        const snowEdge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.05, d * 0.82), snowMat);
        snowEdge.position.set(x, 0.13, z);
        snowEdge.receiveShadow = true;
        parent.add(snowEdge);
    }
    
    function buildNordicStreetLamp(lx, lz, hasPointLight) {
        const lamp = new THREE.Group();
        lamp.position.set(lx, 0, lz);
    
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.35, 16), poleMat);
        base.position.y = 0.18;
        base.castShadow = true;
        lamp.add(base);
    
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 14), poleMat);
        pole.position.y = 1.3;
        pole.castShadow = true;
        lamp.add(pole);
    
        const lanternGlowMat = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xf59e0b,
            emissiveIntensity: 1.2
        });
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.42, 6), lanternGlowMat);
        lantern.position.y = 2.62;
        lamp.add(lantern);
    
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.24, 6), poleMat);
        cap.position.y = 2.94;
        lamp.add(cap);
    
        const snowCap = new THREE.Mesh(
            new THREE.ConeGeometry(0.26, 0.14, 6),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
        );
        snowCap.position.y = 3.02;
        lamp.add(snowCap);
    
        if (hasPointLight) {
            const ptLight = new THREE.PointLight(0xffbc63, 1.3, 7, 2);
            ptLight.position.set(0, 2.6, 0);
            lamp.add(ptLight);
            const halo = new THREE.Sprite(new THREE.SpriteMaterial({
                map: lanternHalo(), color: 0xffc882, opacity: .36, transparent: true,
                depthWrite: false, blending: THREE.AdditiveBlending
            }));
            halo.position.copy(ptLight.position);
            halo.scale.set(1.8, 1.8, 1);
            lamp.add(halo);
        }
    
        scene.add(lamp);
    }
    
    function buildSnowman(sx, sz, rotY = 0) {
        const snowman = new THREE.Group();
        snowman.position.set(sx, 0, sz);
        snowman.rotation.y = rotY;
    
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 });
        const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 24), snowMat);
        bottom.position.y = 0.52;
        bottom.castShadow = true;
        snowman.add(bottom);
    
        const mid = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), snowMat);
        mid.position.y = 1.32;
        mid.castShadow = true;
        snowman.add(mid);
    
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), snowMat);
        head.position.y = 1.94;
        head.castShadow = true;
        snowman.add(head);
    
        // 빨간 목도리
        const scarfMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 });
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.075, 14, 24), scarfMat);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = 1.66;
        snowman.add(scarf);
    
        // 당근 코 & 눈 & 단추
        const carrot = new THREE.Mesh(
            new THREE.ConeGeometry(0.055, 0.28, 12),
            new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 })
        );
        carrot.rotation.x = Math.PI / 2;
        carrot.position.set(0, 1.93, 0.38);
        snowman.add(carrot);
    
        const coalMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
        [-0.1, 0.1].forEach(ex => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), coalMat);
            eye.position.set(ex, 2.01, 0.29);
            snowman.add(eye);
        });
        [1.22, 1.44].forEach(by => {
            const btn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), coalMat);
            btn.position.set(0, by, 0.43);
            snowman.add(btn);
        });
    
        // 검은 실크햇 모자
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20), hatMat);
        brim.position.y = 2.22;
        snowman.add(brim);
        const topHat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 20), hatMat);
        topHat.position.y = 2.41;
        snowman.add(topHat);
    
        scene.add(snowman);
    }
    
    function buildSantaMailbox(mx, mz) {
        const boxGroup = new THREE.Group();
        boxGroup.position.set(mx, 0, mz);
    
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.09, 1.25, 14),
            new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.85 })
        );
        post.position.y = 0.62;
        post.castShadow = true;
        boxGroup.add(post);
    
        const redBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.56, 0.68, 0.44),
            new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 })
        );
        redBox.position.y = 1.48;
        redBox.castShadow = true;
        boxGroup.add(redBox);
    
        const snowRoof = new THREE.Mesh(
            new THREE.BoxGeometry(0.64, 0.14, 0.52),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
        );
        snowRoof.position.y = 1.86;
        boxGroup.add(snowRoof);
    
        scene.add(boxGroup);
    }
    
    /**
     * ============================================================================
     * 3. 배경 환경 구축 (북유럽 설원, 오로라, 통나무 산책로, 굴뚝 오두막, 설산)
     * ============================================================================
     */
    function buildEnvironment() {
        createAuroraAndStars();
    
        // 3-1. 부드러운 굴곡의 북유럽 설원 바닥
        const groundGeo = new THREE.CircleGeometry(110, 64);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0xdbeafe,
            roughness: 0.9,
            metalness: 0.04
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.receiveShadow = true;
        scene.add(ground);
    
        // 3-2. 북유럽 통나무 원목 산책로 (따뜻한 원목 판자 길)
        const pathGroup = new THREE.Group();
        const woodPlankMat = new THREE.MeshStandardMaterial({ color: 0x7c4a2d, roughness: 0.75 });
        const plankSnowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
    
        for (let z = gardenBounds.back + 1; z < gardenBounds.front; z += 1.6) {
            createWoodenPlank(0, z, 2.8, 1.15, pathGroup, woodPlankMat, plankSnowMat);
        }
        for (let x = -gardenBounds.side + 1; x < gardenBounds.side; x += 1.6) {
            if (Math.abs(x) < 1.5) continue;
            createWoodenPlank(x, 0.5, 1.15, 2.6, pathGroup, woodPlankMat, plankSnowMat);
        }
        scene.add(pathGroup);
    
        // 3-3. 자연스럽게 흩어져 배치된 소원 나무 심기 구역 (유기적 배치)
        positions.forEach(([wx, wz]) => {
            const slotGroup = new THREE.Group();
            slotGroup.position.set(wx, 0.02, wz);
    
            // 눈밭 위 아늑한 원형 나무 테두리 화단
            const baseGeo = new THREE.CylinderGeometry(1.32, 1.44, 0.14, 28);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.85 });
            const baseMesh = new THREE.Mesh(baseGeo, baseMat);
            baseMesh.receiveShadow = true;
            slotGroup.add(baseMesh);
    
            // 내부 소복한 눈 화단
            const innerGeo = new THREE.CylinderGeometry(1.16, 1.16, 0.17, 28);
            const innerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.92 });
            const innerMesh = new THREE.Mesh(innerGeo, innerMat);
            slotGroup.add(innerMesh);
    
            // 호버 시 나타나는 은은한 에메랄드 안내 링
            const ringGeo = new THREE.RingGeometry(1.2, 1.38, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x34d399,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.0
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.y = 0.1;
            slotGroup.add(ringMesh);
    
            scene.add(slotGroup);
    
            const hitGeo = new THREE.CylinderGeometry(1.4, 1.4, 1.2, 16);
            const hitMat = new THREE.MeshBasicMaterial({ visible: false });
            const hitMesh = new THREE.Mesh(hitGeo, hitMat);
            hitMesh.position.set(wx, 0.6, wz);
            scene.add(hitMesh);
    
            treeSlots.push({
                x: wx,
                z: wz,
                group: slotGroup,
                ringMesh,
                hitMesh
            });
        });
    
        // 3-4. 굴뚝이 있는 북유럽 산타 통나무 집 (Santa's Cozy Chimney House)
        buildSantaLogCabin(cabinPosition.x, cabinPosition.z);
    
        // 3-5. 북유럽 클래식 스트리트 가로등 (따뜻한 호박빛 조명)
        const lanternCoords = [[2.2, -8.5], [-2.2, -2.5], [2.2, 5.6], [-2.2, 12.7], [-11.9, 2.3]];
        lanternCoords.forEach(([x, z]) => buildNordicStreetLamp(x, z, true));
    
        // 3-6. 산타 빌리지 귀여운 소품 (눈사람 & 산타 우체통 - 아치 문 제거 후 깔끔하게 배치)
        buildSnowman(-2.8, 12.6, 0.35);
        buildSnowman(8.8, -12.8, -0.45);
        buildSantaMailbox(2.6, 12.6);
    
        // 3-7. 북유럽 통나무 목책 울타리 & 자연스러운 설산 파노라마 (배경 나무 제거)
        buildPerimeterAndMountains();
    }
    function buildSantaLogCabin(px, pz) {
        const cabin = new THREE.Group();
        cabin.position.set(px, 0, pz);
    
        // 석조 기초 단
        const stoneBase = new THREE.Mesh(
            new THREE.BoxGeometry(12.2, 0.6, 8.2),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 })
        );
        stoneBase.position.y = 0.3;
        stoneBase.receiveShadow = true;
        stoneBase.castShadow = true;
        cabin.add(stoneBase);
    
        // 북유럽 전통 레드 우드 통나무 벽면
        const redWallMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.65 });
        const wall = new THREE.Mesh(new THREE.BoxGeometry(11.0, 4.2, 6.8), redWallMat);
        wall.position.y = 2.7;
        wall.castShadow = true;
        wall.receiveShadow = true;
        cabin.add(wall);
    
        // 가로 통나무 입체 질감 표현
        const logTrimMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.75 });
        for (let ly = 1.0; ly <= 4.4; ly += 0.55) {
            const logBar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 11.2, 12), logTrimMat);
            logBar.rotation.z = Math.PI / 2;
            logBar.position.set(0, ly, 3.42);
            cabin.add(logBar);
        }
    
        // 화이트 코너 트림 디테일
        const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
        [[-5.52, -3.42], [5.52, -3.42], [-5.52, 3.42], [5.52, 3.42]].forEach(([cx, cz]) => {
            const trim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.3, 0.32), whiteTrimMat);
            trim.position.set(cx, 2.7, cz);
            cabin.add(trim);
        });
    
        // 아늑한 오두막 현관 계단 & 나무 현관문 + 크리스마스 리스 장식
        const porchStep = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.35, 1.4),
            new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 })
        );
        porchStep.position.set(0, 0.18, 4.2);
        porchStep.receiveShadow = true;
        cabin.add(porchStep);
    
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 });
        const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.85, 0.24), whiteTrimMat);
        doorFrame.position.set(0, 2.0, 3.45);
        cabin.add(doorFrame);
    
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.58, 0.28), doorMat);
        door.position.set(0, 1.9, 3.48);
        cabin.add(door);
    
        const wreath = new THREE.Mesh(
            new THREE.TorusGeometry(0.36, 0.1, 12, 24),
            new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 })
        );
        wreath.position.set(0, 2.38, 3.65);
        cabin.add(wreath);
    
        // 따뜻한 노란 불빛이 새어나오는 북유럽 십자 격자 창문
        const windowGlowMat = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.95,
            roughness: 0.25
        });
        [-3.3, 3.3].forEach(wx => {
            const winFrame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.85, 0.22), whiteTrimMat);
            winFrame.position.set(wx, 2.7, 3.45);
            cabin.add(winFrame);
    
            const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.52), windowGlowMat);
            winGlass.position.set(wx, 2.7, 3.57);
            cabin.add(winGlass);
    
            // 창문 십자 문살
            const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 0.05), whiteTrimMat);
            vBar.position.set(wx, 2.7, 3.59);
            cabin.add(vBar);
            const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.05), whiteTrimMat);
            hBar.position.set(wx, 2.7, 3.59);
            cabin.add(hBar);
        });
    
        // 박공지붕 + 두꺼운 눈 지붕
        const roofDarkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
        const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
    
        const gableRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 12.2, 3), roofDarkMat);
        gableRoof.rotation.z = Math.PI / 2;
        gableRoof.scale.set(0.62, 1, 0.85);
        gableRoof.position.y = 6.2;
        gableRoof.castShadow = true;
        cabin.add(gableRoof);
    
        const snowRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.32, 5.32, 12.4, 3), snowRoofMat);
        snowRoof.rotation.z = Math.PI / 2;
        snowRoof.scale.set(0.62, 1, 0.86);
        snowRoof.position.y = 6.38;
        cabin.add(snowRoof);
    
        // 벽돌 굴뚝 + 상단 갓 & 쌓인 눈 디테일
        const brickMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.85 });
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.25, 3.1, 1.25), brickMat);
        chimney.position.set(3.4, 7.6, -1.1);
        chimney.castShadow = true;
        cabin.add(chimney);
    
        const chimneyCap = new THREE.Mesh(
            new THREE.BoxGeometry(1.48, 0.25, 1.48),
            new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
        );
        chimneyCap.position.set(3.4, 9.2, -1.1);
        cabin.add(chimneyCap);
    
        const chimneySnow = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 1.42), snowRoofMat);
        chimneySnow.position.set(3.4, 9.36, -1.1);
        cabin.add(chimneySnow);
    
        // 처마 끝 크리스마스 꼬마전구 줄
        const bulbColors = [0xef4444, 0xfbbf24, 0x34d399, 0x38bdf8];
        for (let bx = -5.6; bx <= 5.6; bx += 0.8) {
            const c = bulbColors[Math.abs(Math.round(bx * 2)) % bulbColors.length];
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.11, 10, 10),
                new THREE.MeshBasicMaterial({ color: c })
            );
            bulb.position.set(bx, 4.75, 4.15);
            cabin.add(bulb);
        }
    
        // 오두막 앞 따뜻한 실내/현관 조명
        const cabinLight = new THREE.PointLight(0xffb703, 1.45, 22);
        cabinLight.position.set(0, 3.4, 5.2);
        cabin.add(cabinLight);
    
        // 굴뚝 연기 파티클 생성
        for (let s = 0; s < 16; s++) {
            const smokeMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.32 + Math.random() * 0.28, 12, 12),
                new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45 })
            );
            smokeMesh.position.set(px + 3.4, 9.5 + s * 0.6, pz - 1.1);
            scene.add(smokeMesh);
            chimneySmokes.push({
                mesh: smokeMesh,
                originX: px + 3.4,
                originY: 9.5,
                originZ: pz - 1.1,
                progress: s / 16
            });
        }
    
        scene.add(cabin);
    }
    function buildPerimeterAndMountains() {
        // 북유럽 통나무 목책 울타리 (우측 외곽)
        const logMat = new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.85 });
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
        const fenceX = gardenBounds.side + 1;
        for (let z = gardenBounds.back; z <= gardenBounds.front; z += 3.2) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.5, 12), logMat);
            post.position.set(fenceX, 0.75, z);
            post.castShadow = true;
            scene.add(post);
    
            const capSnow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), snowMat);
            capSnow.position.set(fenceX, 1.52, z);
            scene.add(capSnow);
    
            if (z + 3.2 <= gardenBounds.front) {
                [0.55, 1.1].forEach(ry => {
                    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 10), logMat);
                    rail.rotation.x = Math.PI / 2;
                    rail.position.set(fenceX, ry, z + 1.6);
                    scene.add(rail);
                });
            }
        }
    
        // 자연스러운 다중 능선 설산 파노라마 (유기적 버텍스 변형 + 설선 컬러 그라데이션)
        const ridgeCount = 26;
        for (let i = 0; i < ridgeCount; i++) {
            const angle = (i / ridgeCount) * Math.PI * 2 + Math.sin(i * 1.7) * 0.08;
            const isBackLayer = i % 2 === 0;
            const radius = isBackLayer ? 84 + (i % 4) * 5 : 68 + (i % 3) * 4;
            const mx = Math.cos(angle) * radius;
            const mz = Math.sin(angle) * radius;
            const height = isBackLayer ? 26 + (i % 5) * 5 : 15 + (i % 4) * 4;
            const baseRadius = isBackLayer ? 28 + (i % 3) * 6 : 20 + (i % 3) * 4;
    
            // 다중 세그먼트 원뿔에 자연스러운 능선 굴곡(노이즈)과 설선 정점 색상 부여
            const mGeo = new THREE.ConeGeometry(baseRadius, height, 18, 8, true);
            const pos = mGeo.attributes.position;
            const colors = new Float32Array(pos.count * 3);
    
            const rockColor = new THREE.Color(isBackLayer ? 0x13233c : 0x1b3152);
            const midSnowColor = new THREE.Color(0x94b8d8);
            const peakSnowColor = new THREE.Color(0xf1f5f9);
    
            for (let v = 0; v < pos.count; v++) {
                const vx = pos.getX(v);
                const vy = pos.getY(v);
                const vz = pos.getZ(v);
    
                // 높이 비율 (0: 산기슭 ~ 1: 정상)
                const hRatio = (vy + height / 2) / height;
    
                if (hRatio < 0.96) {
                    const theta = Math.atan2(vz, vx);
                    // 산 능선 골짜기 굴곡 변형
                    const ridgeNoise =
                        Math.sin(theta * 5 + i * 2.1) * 0.16 +
                        Math.cos(theta * 9 - i * 1.3) * 0.08 +
                        Math.sin(hRatio * 6 + theta * 3) * 0.06;
                    const scaleXZ = 1 + ridgeNoise * (1 - hRatio * 0.45);
                    pos.setX(v, vx * scaleXZ);
                    pos.setZ(v, vz * scaleXZ);
                    pos.setY(v, vy + Math.sin(theta * 4 + i) * 1.1 * (1 - hRatio));
                }
    
                // 자연스러운 설선(Snowline) 블렌딩
                const snowThreshold = 0.42 + Math.sin(Math.atan2(vz, vx) * 6 + i) * 0.09;
                const c = new THREE.Color();
                if (hRatio < snowThreshold) {
                    c.copy(rockColor);
                } else if (hRatio < snowThreshold + 0.16) {
                    c.lerpColors(rockColor, midSnowColor, (hRatio - snowThreshold) / 0.16);
                } else {
                    c.lerpColors(midSnowColor, peakSnowColor, Math.min(1, (hRatio - snowThreshold - 0.16) / 0.25));
                }
    
                colors[v * 3] = c.r;
                colors[v * 3 + 1] = c.g;
                colors[v * 3 + 2] = c.b;
            }
    
            mGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            mGeo.computeVertexNormals();
    
            const mMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.88,
                metalness: 0.04,
                flatShading: true
            });
    
            const mountainMesh = new THREE.Mesh(mGeo, mMat);
            mountainMesh.position.set(mx, height / 2 - 1.5, mz);
            mountainMesh.rotation.y = i * 0.7;
            scene.add(mountainMesh);
        }
    }
    
    /**
     * ============================================================================
     * 4. 고폴리곤 소원 나무 생성기 (성장 단계별 크기 + 반짝이는 오너먼트 + 별)
     * ============================================================================
     */

    function addStringLights(treeGroup, count, branches) {
        if (count <= 0) return;
        const bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
            new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
        bulbs.name = 'mini-bulbs';
        // r128 does not calculate per-instance bounds for culling.
        bulbs.frustumCulled = false;
        const transform = new THREE.Matrix4();
        const colors = [0xffdf91, 0xffeec7, 0xfc7975, 0x84dfff, 0xffc36d].map(color => new THREE.Color(color));
        for (let index = 0; index < count; index++) {
            const { radius, base, height, rotation } = branches[index % branches.length];
            const row = Math.floor(index / branches.length);
            const angle = row * 2.399963 + rotation + index % branches.length * .55;
            const level = .29 + (row * .618034 % 1) * .28;
            const distance = radius * (1.02 - (level - .29) * .8);
            const size = Math.min(.024, radius * .027);
            transform.makeScale(size, size * 1.22, size);
            transform.setPosition(Math.sin(angle) * distance, base + level * height, Math.cos(angle) * distance);
            bulbs.setMatrixAt(index, transform);
            bulbs.setColorAt(index, colors[(row * 3 + index % branches.length) % colors.length]);
        }
        bulbs.instanceMatrix.needsUpdate = true;
        treeGroup.add(bulbs);
    }

    function createStylizedPineTree(growth, ornamentCount, isMine) {
        const treeGroup = new THREE.Group();
        const scale = .66 + growth * .014;
        // Four days of growth fill out each branch whorl. The sixth opens on day 21.
        const layers = Math.max(1, Math.ceil(growth / 4));
        const canopyHeight = .65 + growth * .20;
        const step = canopyHeight / (layers + .38);
        const trunkHeight = .46 + growth * .015;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.13 + growth * .002, .19 + growth * .004, trunkHeight + .18, 9),
            new THREE.MeshStandardMaterial({ color: 0x56402a, roughness: .9, flatShading: true }));
        trunk.position.y = (trunkHeight + .18) / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const palette = [0xef4444, 0xfbbf24, 0x38bdf8, 0xf472b6, 0xa78bfa, 0xfb923c];
        const lowerGreen = new THREE.Color(0x41612b);
        const upperGreen = new THREE.Color(0x80a643);
        const top = trunkHeight + canopyHeight;
        const branches = [];
        const shapeCount = Math.min(ornamentCount, shapedOrnamentLimit);
        let widest = 0;
        for (let tier = 0; tier < layers; tier++) {
            const progress = tier / Math.max(1, layers - 1);
            const spread = 1 - progress * .68;
            const radius = (.44 + growth * .061) * spread;
            const base = trunkHeight + tier * step;
            const crown = tier === layers - 1;
            const height = step * (crown ? 1.38 : 1.74);
            const profile = [[0, .13], [1, .09], [.89, .27], [.58, .65], [crown ? .21 : .37, .91], [0, 1]];
            const segments = 12;
            const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius, y * height)), segments);
            const positions = geometry.attributes.position;
            const rotation = tier * Math.PI / 7;
            branches.push({ radius, base, height, rotation });
            for (let slice = 0; slice <= segments; slice++) {
                const tip = slice % 2 === 0;
                const angle = slice / segments * Math.PI * 2 + rotation;
                for (let ring = 0; ring < profile.length; ring++) {
                    const [width, level] = profile[ring];
                    const edge = ring === 1 ? 1 : ring === 2 ? .46 : 0;
                    const distance = radius * width * (1 - edge * (tip ? 0 : .23));
                    const y = height * (level + edge * (tip ? -.09 : .11));
                    positions.setXYZ(slice * profile.length + ring, Math.sin(angle) * distance, y, Math.cos(angle) * distance);
                }
            }
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
                color: lowerGreen.clone().lerp(upperGreen, .2 + progress * .62),
                roughness: .88,
                flatShading: true
            }));
            mesh.name = growth ? 'growth-tier' : 'seedling';
            mesh.position.y = base;
            mesh.castShadow = mesh.receiveShadow = true;
            treeGroup.add(mesh);
            widest = Math.max(widest, radius);

            // Start low and spread added decorations around the visible branches.
            for (let index = tier; index < shapeCount; index += layers) {
                const branchIndex = Math.floor(index / layers);
                const segment = branchIndex * 5 % segments;
                const row = Math.floor(branchIndex / segments);
                const angle = rotation + segment * Math.PI / 6 + row * .11;
                const ornament = createOrnament(index % 5, palette[index % palette.length]);
                const distance = radius * ((segment % 2 ? .85 : .97) - row * .12);
                ornament.position.set(Math.sin(angle) * distance, base + height * (.20 + row * .14), Math.cos(angle) * distance);
                ornament.rotation.y = angle;
                treeGroup.add(ornament);
            }
        }
        addStringLights(treeGroup, ornamentCount - shapeCount, branches);

        const starMat = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xfacc15,
            emissiveIntensity: isMine ? 1.1 : 0.65,
            roughness: 0.2
        });
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), starMat);
        star.position.y = top + .17;
        star.userData.isStar = true;
        treeGroup.add(star);
    
        // 내 나무인 경우 바닥에 은은한 황금빛 오라 링 추가
        if (isMine) {
            const auraGeo = new THREE.RingGeometry(1.18, 1.36, 32);
            auraGeo.rotateX(-Math.PI / 2);
            const auraMat = new THREE.MeshBasicMaterial({
                color: 0xfde047,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85
            });
            const aura = new THREE.Mesh(auraGeo, auraMat);
            aura.position.y = 0.12 / scale;
            aura.scale.setScalar(1 / scale);
            treeGroup.add(aura);
        }
    
        treeGroup.scale.setScalar(scale);
        treeGroup.userData.height = top + .35;
        treeGroup.userData.radius = widest * 1.1;
        return treeGroup;
    }

    function createPlayerCharacter() {
        const player = new THREE.Group();
    
        // 재질 정의
        const coatMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }); // 따뜻한 레드 코트
        const scarfMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 }); // 크림색 목도리
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xfcd5b5, roughness: 0.55 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.65 });
        const pomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    
        // 다리 (좌/우 관절 피벗)
        const leftLegPivot = new THREE.Group();
        leftLegPivot.position.set(-0.18, 0.55, 0);
        const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 16), pantsMat);
        leftLeg.position.y = -0.25;
        leftLeg.castShadow = true;
        leftLegPivot.add(leftLeg);
        player.add(leftLegPivot);
    
        const rightLegPivot = new THREE.Group();
        rightLegPivot.position.set(0.18, 0.55, 0);
        const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 16), pantsMat);
        rightLeg.position.y = -0.25;
        rightLeg.castShadow = true;
        rightLegPivot.add(rightLeg);
        player.add(rightLegPivot);
    
        // 몸통 (부드러운 캡슐형 코트)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.78, 24), coatMat);
        body.position.y = 0.92;
        body.castShadow = true;
        player.add(body);
    
        // 코트 단추 디테일
        [0.8, 1.02].forEach(by => {
            const btn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), scarfMat);
            btn.position.set(0, by, 0.35);
            player.add(btn);
        });
    
        // 목도리 (토러스 링 + 늘어진 자락)
        const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.09, 16, 28), scarfMat);
        scarfRing.rotation.x = Math.PI / 2;
        scarfRing.position.y = 1.32;
        scarfRing.castShadow = true;
        player.add(scarfRing);
    
        const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.06), scarfMat);
        scarfTail.position.set(0.18, 1.12, 0.32);
        scarfTail.rotation.z = -0.15;
        player.add(scarfTail);
    
        // 팔 (좌/우 관절 피벗)
        const leftArmPivot = new THREE.Group();
        leftArmPivot.position.set(-0.4, 1.22, 0);
        const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.52, 16), coatMat);
        leftArm.position.y = -0.22;
        leftArm.rotation.z = 0.18;
        leftArm.castShadow = true;
        leftArmPivot.add(leftArm);
        player.add(leftArmPivot);
    
        const rightArmPivot = new THREE.Group();
        rightArmPivot.position.set(0.4, 1.22, 0);
        const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.52, 16), coatMat);
        rightArm.position.y = -0.22;
        rightArm.rotation.z = -0.18;
        rightArm.castShadow = true;
        rightArmPivot.add(rightArm);
        player.add(rightArmPivot);
    
        // 머리 (고폴리곤 구체)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 28), skinMat);
        head.position.y = 1.68;
        head.castShadow = true;
        player.add(head);
    
        // 눈 (귀여운 까만 눈동자)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
        [-0.12, 0.12].forEach(ex => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), eyeMat);
            eye.position.set(ex, 1.68, 0.33);
            player.add(eye);
        });
    
        // 겨울 방울 비니 모자
        const hatBase = new THREE.Mesh(new THREE.SphereGeometry(0.375, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hatMat);
        hatBase.position.y = 1.71;
        hatBase.rotation.x = -0.15;
        hatBase.castShadow = true;
        player.add(hatBase);
    
        const hatBrim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 14, 28), scarfMat);
        hatBrim.rotation.x = Math.PI / 2 - 0.15;
        hatBrim.position.set(0, 1.76, -0.02);
        player.add(hatBrim);
    
        const pomPom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), pomMat);
        pomPom.position.set(0, 2.12, -0.08);
        player.add(pomPom);
    
        // 캐릭터 바닥 위치 표시 링
        const footRingGeo = new THREE.RingGeometry(0.45, 0.55, 28);
        footRingGeo.rotateX(-Math.PI / 2);
        const footRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
        const footRing = new THREE.Mesh(footRingGeo, footRingMat);
        footRing.position.y = 0.03;
        player.add(footRing);
    
        player.userData = {
            leftLegPivot,
            rightLegPivot,
            leftArmPivot,
            rightArmPivot,
            walkCycle: 0
        };
    
        return player;
    }
    
    /**
     * ============================================================================
     * 6. 흩날리는 눈송이 파티클 시스템
     * ============================================================================
     */
    const snowCount = 1200;
    const snowGeo = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(snowCount * 3);
    const snowSpeeds = new Float32Array(snowCount);
    
    for (let i = 0; i < snowCount; i++) {
        snowPositions[i * 3] = (Math.random() - 0.5) * 90;
        snowPositions[i * 3 + 1] = Math.random() * 35;
        snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
        snowSpeeds[i] = 0.03 + Math.random() * 0.05;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    
    const snowMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.22,
        transparent: true,
        opacity: 0.85
    });
    const snowParticles = new THREE.Points(snowGeo, snowMat);
    scene.add(snowParticles);

    function lanternHalo() {
        if (haloTexture) return haloTexture;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(.23, 'rgba(255,234,188,0.75)');
        gradient.addColorStop(1, 'rgba(255,208,128,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        haloTexture = new THREE.CanvasTexture(canvas);
        return haloTexture;
    }

    function createOrnament(kind, color) {
        const material = new THREE.MeshStandardMaterial({ color, roughness: .35, emissive: color, emissiveIntensity: .38 });
        const group = new THREE.Group();
        const piece = (geometry, x = 0, y = 0, paint = material) => {
            const mesh = new THREE.Mesh(geometry, paint);
            mesh.position.set(x, y, 0);
            group.add(mesh);
            return mesh;
        };
        if (kind === 0) {
            piece(new THREE.SphereGeometry(.105, 12, 10));
        } else if (kind === 1) {
            const star = new THREE.Shape();
            for (let i = 0; i < 10; i++) {
                const angle = Math.PI / 2 + i * Math.PI / 5;
                const radius = i % 2 ? .064 : .15;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) star.moveTo(x, y);
                else star.lineTo(x, y);
            }
            star.closePath();
            piece(new THREE.ExtrudeGeometry(star, { depth: .035, bevelEnabled: false }));
        } else if (kind === 2) {
            for (const side of [-1, 1]) {
                const loop = piece(new THREE.SphereGeometry(.09, 10, 8), side * .085);
                loop.scale.set(1.1, .65, .45);
                loop.rotation.z = side * .32;
                piece(new THREE.BoxGeometry(.055, .13, .03), side * .05, -.085).rotation.z = side * .28;
            }
            piece(new THREE.SphereGeometry(.038, 8, 6));
        } else if (kind === 3) {
            const white = new THREE.MeshStandardMaterial({ color: 0xffeee3 });
            piece(new THREE.TorusGeometry(.073, .027, 6, 14, Math.PI), 0, .065, white);
            piece(new THREE.CylinderGeometry(.027, .027, .19, 8), -.073, -.03, white);
            for (let i = 0; i < 3; i++) {
                piece(new THREE.CylinderGeometry(.029, .029, .022, 8), -.073, -.09 + i * .064).rotation.z = .19;
            }
        } else {
            const bulb = piece(new THREE.SphereGeometry(.065, 10, 8));
            bulb.scale.y = 1.4;
            material.emissiveIntensity = 1.3;
            piece(new THREE.CylinderGeometry(.037, .037, .042, 8), 0, .083, new THREE.MeshStandardMaterial({ color: 0x50463e }));
        }
        return group;
    }

    function disposeMesh(object) {
        scene.remove(object);
        object.traverse(child => {
            if (child.isInstancedMesh) child.dispose();
            child.geometry?.dispose();
            child.material?.map?.dispose();
            child.material?.dispose();
        });
    }

    function createWishLabel(wish) {
        const rows = [...wish.replace(/\s+/g, ' ')].reduce((lines, character, index) => {
            if (index % 19 === 0) lines.push(character);
            else lines[lines.length - 1] += character;
            return lines;
        }, []);
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 16 + rows.length * 24;
        const context = canvas.getContext('2d');
        context.fillStyle = '#0f172ae8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff7de';
        context.font = '700 18px "Noto Sans KR", sans-serif';
        context.textAlign = 'center';
        rows.forEach((row, index) => context.fillText(row, canvas.width / 2, 24 + index * 24, canvas.width - 18));
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
        sprite.scale.set(3.5, 3.5 * canvas.height / canvas.width, 1);
        return sprite;
    }

    function updateTrees(trees, mine, targets) {
        decorationPlots = new Set(targets);
        treeSlots.forEach((slot, index) => {
            const target = decorationPlots.has(index);
            slot.ringMesh.material.color.setHex(target ? 0xfbbf24 : 0x34d399);
            slot.ringMesh.material.opacity = index === highlighted ? .85 : target ? .68 : 0;
        });
        const retained = new Set(trees.map(tree => tree.slot));
        for (const [index, tree] of plantedTrees) {
            if (retained.has(index)) continue;
            disposeMesh(tree.meshGroup);
            disposeMesh(tree.hitMesh);
            plantedTrees.delete(index);
        }
        for (const tree of trees) {
            const slot = treeSlots[tree.slot];
            if (!slot) continue;
            const growth = Math.min(23, tree.ownWater ?? 0);
            const ornaments = tree.friendWater ?? 0;
            const isMine = tree.slot === mine?.slot;
            let wish = isMine ? mine.wish : '';
            if (tree.ownerName) {
                const summary = [...tree.wish.trim().replace(/\s+/g, ' ')];
                wish = tree.ownerName + ' · ' + summary.slice(0, 37).join('') + (summary.length > 37 ? '…' : '');
            }
            const old = plantedTrees.get(tree.slot);
            if (old?.growth === growth && old.ornaments === ornaments && old.isMine === isMine && old.wish === wish) continue;
            if (old) {
                disposeMesh(old.meshGroup);
                disposeMesh(old.hitMesh);
            }
            const meshGroup = createStylizedPineTree(growth, ornaments, isMine);
            const scale = meshGroup.scale.x;
            const height = meshGroup.userData.height * scale;
            meshGroup.position.set(slot.x, .08, slot.z);
            if (wish) {
                const label = createWishLabel(wish);
                label.position.y = meshGroup.userData.height + label.scale.y / (2 * scale);
                label.scale.divideScalar(scale);
                meshGroup.add(label);
            }
            const hitMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(meshGroup.userData.radius * .58 * scale, meshGroup.userData.radius * scale, height, 20),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            hitMesh.position.set(slot.x, height / 2, slot.z);
            hitMesh.userData.plot = tree.slot;
            scene.add(meshGroup, hitMesh);
            plantedTrees.set(tree.slot, { meshGroup, hitMesh, growth, ornaments, isMine, wish });
        }
    }

    buildEnvironment();
    treeSlots.forEach((slot, index) => { slot.hitMesh.userData.plot = index; });
    const player = createPlayerCharacter();
    scene.add(player);

    function nearbySlot() {
        if (!enabled) return -1;
        let closest = -1;
        let distance = 2.4;
        treeSlots.forEach((slot, index) => {
            const candidate = Math.hypot(slot.x - player.position.x, slot.z - player.position.z);
            if (candidate >= distance) return;
            distance = candidate;
            closest = index;
        });
        return closest;
    }

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const canvas = renderer.domElement;
    const zoom = amount => { cameraZoom = Math.min(52, Math.max(7, cameraZoom + amount)); };
    function pick(event) {
        const bounds = canvas.getBoundingClientRect();
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const targets = treeSlots.flatMap((slot, index) => plantedTrees.has(index) ? [slot.hitMesh, plantedTrees.get(index).hitMesh] : [slot.hitMesh]);
        return ray.intersectObjects(targets)[0]?.object.userData.plot ?? -1;
    }

    let drag = null;
    let highlighted = -1;
    function highlight(slot) {
        if (slot === highlighted) return;
        if (highlighted >= 0) treeSlots[highlighted].ringMesh.material.opacity = decorationPlots.has(highlighted) ? .68 : 0;
        highlighted = slot;
        if (slot >= 0) treeSlots[slot].ringMesh.material.opacity = .85;
    }
    canvas.addEventListener('pointerdown', event => {
        if (!enabled || event.button !== 0 || drag) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        if (!enabled) return;
        if (drag?.id === event.pointerId) {
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            drag = { ...drag, x: event.clientX, y: event.clientY, distance: drag.distance + Math.hypot(dx, dy) };
            if (drag.distance > 4) {
                cameraAngle -= dx * .007;
                cameraPitch = Math.min(1.15, Math.max(.28, cameraPitch + dy * .005));
            }
        } else if (event.pointerType === 'mouse') {
            const slot = pick(event);
            highlight(plantedTrees.has(slot) ? -1 : slot);
            canvas.style.cursor = slot >= 0 ? 'pointer' : 'grab';
        }
    });
    canvas.addEventListener('pointerup', event => {
        if (!enabled || event.pointerId !== drag?.id) return;
        if (drag.distance <= 4) {
            const slot = pick(event);
            if (slot >= 0) onPick(slot);
        }
        drag = null;
    });
    canvas.addEventListener('lostpointercapture', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => highlight(-1));
    canvas.addEventListener('wheel', event => {
        if (!enabled) return;
        event.preventDefault();
        zoom(event.deltaY * .012);
    }, { passive: false });

    new ResizeObserver(() => {
        camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }).observe(container);

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
    
        const delta = Math.min(clock.getDelta(), .05);
        const elapsed = clock.elapsedTime;
    
        // 1. 캐릭터 이동 처리 (카메라 시점 방향 기준)
        let moveX = stick.x;
        let moveZ = stick.z;
        if (moveKeys.up) moveZ -= 1;
        if (moveKeys.down) moveZ += 1;
        if (moveKeys.left) moveX -= 1;
        if (moveKeys.right) moveX += 1;
    
        if (enabled && (moveX !== 0 || moveZ !== 0)) {
            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX /= Math.max(1, len);
            moveZ /= Math.max(1, len);
    
            // 카메라 수평 회전 각도에 맞춘 월드 이동 벡터 계산
            const sinA = Math.sin(cameraAngle);
            const cosA = Math.cos(cameraAngle);
            const worldDX = moveX * cosA + moveZ * sinA;
            const worldDZ = -moveX * sinA + moveZ * cosA;
    
            const speed = 6.2 * delta;
            player.position.x = Math.max(-gardenBounds.side, Math.min(gardenBounds.side, player.position.x + worldDX * speed));
            player.position.z = Math.max(gardenBounds.back, Math.min(gardenBounds.front, player.position.z + worldDZ * speed));
    
            // 진행 방향으로 부드럽게 회전
            const targetRot = Math.atan2(worldDX, worldDZ);
            let diff = targetRot - player.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            player.rotation.y += diff * 0.18;
    
            // 걷기 팔/다리 스윙 애니메이션
            player.userData.walkCycle += delta * 11;
            const swing = Math.sin(player.userData.walkCycle) * 0.55;
            player.userData.leftLegPivot.rotation.x = swing;
            player.userData.rightLegPivot.rotation.x = -swing;
            player.userData.leftArmPivot.rotation.x = -swing * 0.8;
            player.userData.rightArmPivot.rotation.x = swing * 0.8;
        } else {
            // 정지 상태일 때 팔/다리 자연스럽게 복귀
            player.userData.leftLegPivot.rotation.x *= 0.85;
            player.userData.rightLegPivot.rotation.x *= 0.85;
            player.userData.leftArmPivot.rotation.x *= 0.85;
            player.userData.rightArmPivot.rotation.x *= 0.85;
        }
    
        // 2. 카메라 위치 업데이트 (플레이어 중심 오빗 추적)
        const camDistH = Math.cos(cameraPitch) * cameraZoom;
        const camHeight = Math.sin(cameraPitch) * cameraZoom;
        const targetCamX = player.position.x + Math.sin(cameraAngle) * camDistH;
        const targetCamZ = player.position.z + Math.cos(cameraAngle) * camDistH;
        const targetCamY = Math.max(2.0, player.position.y + camHeight);
    
        camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.12);
        camera.lookAt(player.position.x, player.position.y + 1.95, player.position.z);
    
        // 3. 나무 꼭대기 별 회전 & 오로라 일렁임 & 굴뚝 연기 & 눈송이 애니메이션
        plantedTrees.forEach(tree => {
            if (tree.meshGroup) {
                tree.meshGroup.children.forEach(child => {
                    if (child.userData && child.userData.isStar) {
                        child.rotation.y = elapsed * 1.5;
                    }
                });
            }
        });
    
        // 오로라 커튼 물결 애니메이션
        auroraRibbons.forEach(ribbon => {
            const pos = ribbon.mesh.geometry.attributes.position.array;
            for (let i = 0; i < pos.length; i += 3) {
                const bx = ribbon.basePos[i];
                const by = ribbon.basePos[i + 1];
                pos[i + 2] = Math.sin(bx * 0.08 + elapsed * ribbon.speed + ribbon.phase) * 4.5
                           + Math.cos(by * 0.15 + elapsed * 0.7) * 1.5;
            }
            ribbon.mesh.geometry.attributes.position.needsUpdate = true;
        });
    
        // 산타 오두막 굴뚝 연기 상승 애니메이션
        chimneySmokes.forEach(smoke => {
            smoke.progress += delta * 0.18;
            if (smoke.progress >= 1) smoke.progress = 0;
            const p = smoke.progress;
            smoke.mesh.position.y = smoke.originY + p * 6.5;
            smoke.mesh.position.x = smoke.originX + Math.sin(elapsed * 1.5 + p * 6) * 0.6 + p * 1.2;
            smoke.mesh.scale.setScalar(0.6 + p * 1.6);
            smoke.mesh.material.opacity = (1 - p) * 0.42;
        });
    
        const positions = snowParticles.geometry.attributes.position.array;
        for (let i = 0; i < snowCount; i++) {
            positions[i * 3 + 1] -= snowSpeeds[i] * delta * 60;
            positions[i * 3] += Math.sin(elapsed + i) * 0.008;
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 35;
            }
        }
        snowParticles.geometry.attributes.position.needsUpdate = true;
    
        onNear(nearbySlot());
        renderer.render(scene, camera);
    }

    function resetView() {
        player.position.set(0, 0, 16);
        cameraZoom = 34;
        cameraAngle = 0.18;
        cameraPitch = 0.53;
        const distance = Math.cos(cameraPitch) * cameraZoom;
        camera.position.set(Math.sin(cameraAngle) * distance, Math.sin(cameraPitch) * cameraZoom,
            player.position.z + Math.cos(cameraAngle) * distance);
    }

    resetView();
    animate();

    return {
        capacity: treeSlots.length,
        updateTrees,
        setEnabled(value) {
            enabled = value;
            if (!enabled) {
                for (const direction in moveKeys) moveKeys[direction] = false;
                stick.x = stick.z = 0;
            }
        },
        setDirection(direction, value) { moveKeys[direction] = value; },
        setStick(x, z) { stick.x = x; stick.z = z; },
        zoom,
        resetView,
        focus(slot) {
            const plot = treeSlots[slot];
            if (!plot) return;
            player.position.set(plot.x, 0, Math.min(gardenBounds.front, plot.z + 1.8));
            cameraZoom = Math.max(14, (plantedTrees.get(slot)?.meshGroup.userData.height ?? 0) * 3.2);
        },
    };
}
