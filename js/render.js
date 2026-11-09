'use strict';
// Renderer, physical sky, image-based lighting, bloom and the day/night cycle.

const HORIZON = [
  [0, '#0a0f22'], [4.8, '#141a33'], [5.8, '#d99a78'], [7, '#b0c6da'], [12, '#aac2d8'], [16.3, '#b8c8d6'],
  [17.5, '#e6ad80'], [18.3, '#a4687a'], [19.2, '#232546'], [24, '#0a0f22'],
];
const _h1 = new THREE.Color(), _h2 = new THREE.Color();
function horizonAt(h) {
  for (let k = 0; k < HORIZON.length - 1; k++)
    if (h >= HORIZON[k][0] && h <= HORIZON[k + 1][0]) {
      const u = (h - HORIZON[k][0]) / (HORIZON[k + 1][0] - HORIZON[k][0]);
      return _h1.set(HORIZON[k][1]).lerp(_h2.set(HORIZON[k + 1][1]), u);
    }
  return _h1.set(HORIZON[0][1]);
}

const Render = {
  init() {
    G.mobile = matchMedia('(pointer: coarse)').matches;
    G.hq = !G.mobile;
    const r = new THREE.WebGLRenderer({ antialias: !G.hq, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, G.hq ? 1.5 : 1));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.8;
    document.body.appendChild(r.domElement);
    G.renderer = r;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, G.hq ? 2600 : 950);
    G.scene.fog = G.hq ? new THREE.Fog(0xc3d6e8, 450, 2300) : new THREE.Fog(0xc3d6e8, 200, 800);

    G.hemi = new THREE.HemisphereLight(0xdfeaf5, 0x5a5446, G.hq ? 0.35 : 0.8);
    G.scene.add(G.hemi);
    G.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    G.sun.castShadow = true;
    const sm = G.hq ? 4096 : 1024;
    G.sun.shadow.mapSize.set(sm, sm);
    const sc = G.sun.shadow.camera;
    const ext = G.hq ? 120 : 80;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 800;
    G.sun.shadow.bias = -0.0004;
    G.sun.shadow.normalBias = 0.6;
    G.scene.add(G.sun); G.scene.add(G.sun.target);
    G.amb = new THREE.AmbientLight(0xffffff, 0.05);
    G.scene.add(G.amb);

    // Physical sky that follows the camera
    this.sky = new THREE.Sky();
    this.sky.scale.setScalar(G.hq ? 2400 : 900);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    G.scene.add(this.sky);

    // Clouds: soft puffs well above the city
    G.clouds = [];
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.cloudMat = cm;
    for (let k = 0; k < 26; k++) {
      const c = new THREE.Group();
      for (let j = 0; j < 7; j++) {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), cm);
        p.scale.set(rand(16, 30), rand(6, 11), rand(12, 22));
        p.position.set(rand(-34, 34), rand(-3, 4), rand(-16, 16));
        c.add(p);
      }
      c.position.set(rand(-3000, 3000), rand(260, 360), rand(-3000, 3000));
      G.scene.add(c); G.clouds.push(c);
    }

    // Environment (reflections + ambient) rendered from the same sky
    if (G.hq) {
      this.pmrem = new THREE.PMREMGenerator(r);
      this.envScene = new THREE.Scene();
      const es = new THREE.Sky(); es.material = this.sky.material; es.scale.setScalar(80);
      this.envScene.add(es);
      this.envGround = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12, 0, TAU, Math.PI / 2 + 0.02, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4d4f4a, side: THREE.BackSide }));
      this.envScene.add(this.envGround);
      this.lastEnvH = -99;

      const pr = r.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { format: THREE.RGBAFormat, type: THREE.HalfFloatType });
      this.composer = new THREE.EffectComposer(r, rt);
      // Ambient occlusion: darkens creases, window reveals, under ledges and where things meet the ground.
      const ao = (this.ao = new THREE.SSAOPass(G.scene, G.camera, innerWidth * pr, innerHeight * pr));
      ao.kernelRadius = 3.5; ao.minDistance = 0.00003; ao.maxDistance = 0.004; ao.strength = 3;
      ao.beautyRenderTarget.dispose();
      ao.beautyRenderTarget = r.capabilities.isWebGL2
        ? new THREE.WebGLMultisampleRenderTarget(innerWidth * pr, innerHeight * pr, { format: THREE.RGBAFormat, type: THREE.HalfFloatType })
        : new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { format: THREE.RGBAFormat, type: THREE.HalfFloatType });
      this.composer.addPass(ao);
      r.shadowMap.autoUpdate = false; // the AO normal pass must not redraw the shadow map
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
      if (!r.capabilities.isWebGL2) {
        this.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
        this.fxaa.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
        this.composer.addPass(this.fxaa);
      }
    }
    addEventListener('resize', () => {
      G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
      r.setSize(innerWidth, innerHeight);
      if (this.composer) {
        this.composer.setSize(innerWidth, innerHeight);
        if (this.fxaa) { const pr = r.getPixelRatio(); this.fxaa.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); }
      }
    });
  },

  update(dt) {
    G.timeOfDay = (G.timeOfDay + dt / 40) % 24;
    const h = G.timeOfDay;
    const az = ((h - 6) / 12) * Math.PI;
    const elev = Math.sin(az);
    const day = smoothstep(clamp(elev * 3 + 0.15, 0, 1));
    G.night = 1 - clamp(elev * 4 + 0.6, 0, 1);
    const dir = new THREE.Vector3(Math.cos(az), Math.sin(az), 0.35).normalize();
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.skyGain.value = clamp(elev * 6 + 0.35, 0, 1);
    u.nightColor.value.set(0.008, 0.012, 0.032).multiplyScalar(G.night);
    u.starAmt.value = G.night * 0.9;
    const hz = horizonAt(h);
    G.scene.fog.color.copy(hz);
    G.renderer.setClearColor(hz);
    this.sky.position.copy(G.camera.position);

    const px = Player.x, pz = Player.z;
    if (elev > -0.03) {
      G.sun.position.set(px + dir.x * 300, Math.max(dir.y, 0.08) * 300, pz + dir.z * 300);
      G.sun.intensity = (G.hq ? 2.2 : 1.2) * smoothstep(clamp(elev * 5, 0, 1)) + 0.05;
      G.sun.color.set(elev < 0.2 ? '#ffb07a' : elev < 0.4 ? '#ffd9b0' : '#fff4e2');
    } else { // moonlight
      G.sun.position.set(px - dir.x * 300, 220, pz - 120);
      G.sun.intensity = G.hq ? 0.35 : 0.25;
      G.sun.color.set('#9fb4e8');
    }
    G.sun.target.position.set(px, 0, pz);
    G.hemi.color.copy(hz).lerp(_h2.set('#ffffff'), 0.4);
    G.hemi.groundColor.set('#5a5446');
    G.hemi.intensity = (G.hq ? 0.2 : 0.5) + day * (G.hq ? 0.12 : 0.4);
    G.amb.intensity = 0.05 + G.night * 0.08;
    G.renderer.toneMappingExposure = 0.8 + G.night * 0.35;
    this.cloudMat.color.copy(hz).lerp(_h2.set('#ffffff'), 0.5 + day * 0.5);
    for (const m of World.nightMats) m.emissiveIntensity = G.night * 1.25;
    if (this.bloom) this.bloom.strength = 0.25 + G.night * 0.55;

    if (this.pmrem && Math.abs(h - this.lastEnvH) > 0.15) {
      this.lastEnvH = h;
      this.envGround.material.color.set('#4d4f4a').multiplyScalar(0.15 + day * 0.85);
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
      G.scene.environment = this.envRT.texture;
      if (old) old.dispose();
    }
  },

  frame() {
    G.renderer.shadowMap.needsUpdate = true;
    if (this.ao) {
      const u = this.ao.ssaoMaterial.uniforms;
      u.cameraProjectionMatrix.value.copy(G.camera.projectionMatrix);
      u.cameraInverseProjectionMatrix.value.copy(G.camera.projectionMatrixInverse);
      u.cameraNear.value = G.camera.near; u.cameraFar.value = G.camera.far;
    }
    if (this.composer) this.composer.render();
    else G.renderer.render(G.scene, G.camera);
  },
};
