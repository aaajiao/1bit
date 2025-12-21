# Wired Brutalism: Chimera Void

一个基于 Three.js 的 **1-bit 抖动渲染** 交互式 3D 体验作品。玩家穿行于程序化生成的嵌合体废墟中，手持一朵发光的花。

---

## 🎮 操作说明

| 按键 | 功能 |
|------|------|
| `W / A / S / D` | 移动 |
| `空格键` | 跳跃 |
| `鼠标` | 视角控制 |
| `点击` | 进入游戏（锁定鼠标） |

---

## 🚀 运行方式

### 开发模式（推荐，支持热更新）
```bash
npm install      # 首次运行需要安装依赖
npm run dev      # 启动 Vite 开发服务器
# 访问 http://localhost:5173
```

### 静态服务器
```bash
npm run serve
# 访问 http://localhost:3000
```

### 单文件版本
直接在浏览器中打开 `1-bit.html`

---

## 📦 项目结构

```
1bit/
├── index.html              # 入口 HTML（ES6 模块版本）
├── 1-bit.html              # 原始单文件版本
├── package.json            # 项目配置
├── README.md               # 本文档
├── styles/
│   └── main.css            # 样式表（扫描线效果等）
└── src/
    ├── main.js             # 主程序入口
    ├── audio/
    │   └── AudioSystem.js  # 程序化音效系统
    ├── shaders/
    │   └── DitherShader.js # 1-bit 抖动着色器 + 线缆脉冲着色器
    ├── player/
    │   ├── Controls.js     # 第一人称移动控制
    │   ├── HandsModel.js   # 解剖学精确的手部模型
    │   └── FlowerProp.js   # 手持发光花朵
    ├── world/
    │   ├── ChunkManager.js # 无限地形区块管理
    │   ├── SharedAssets.js # 共享材质和几何体
    │   ├── BuildingFactory.js # 建筑生成器
    │   ├── FloraFactory.js # 树木/植物生成器
    │   ├── FloorTile.js    # 地板纹理生成
    │   └── CableSystem.js  # 动态线缆系统
    └── utils/
        ├── hash.js         # 确定性伪随机哈希
        └── ObjectPool.js   # 对象池（性能优化）
```

---

## 🛠️ 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| **Three.js** | 0.160.0 | 3D 渲染引擎（ES6 模块版本） |
| **模块系统** | ES6 Import Map | 浏览器原生模块支持 |

### 与原版 (r128) 的兼容性处理

重构时从 Three.js r128 升级到 0.160.0，处理了以下兼容性问题：

| 问题 | 解决方案 |
|------|---------|
| `THREE.RGBFormat` 移除 | 使用 `THREE.RGBAFormat` + 4通道数据 |
| 颜色管理变更 (r152+) | 禁用 `ColorManagement` |
| 光照衰减变更 (r155+) | 增加光照强度，降低衰减值 |
| `PlaneBufferGeometry` 合并 | 使用 `PlaneGeometry` |

---

## 🎨 核心视觉效果

### 1-Bit 抖动着色器 (Bayer Dithering)
使用 **4x4 Bayer 抖动矩阵** 将所有颜色压缩为纯黑与纯白：

```glsl
float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
gray = pow(gray, 0.8) * 2.0;  // Gamma 矫正 + 亮度补偿
float threshold = bayer4x4(pixelCoord);
vec3 finalColor = (gray < threshold) ? vec3(0.0) : vec3(1.0);
```

### 扫描线叠加 (Scanlines)
CRT 风格的扫描线效果，通过 CSS 实现 RGB 色彩偏移。

---

## 🏗️ 程序化生成系统

### Chunk 系统
- **CHUNK_SIZE**: 80 单位
- **RENDER_DISTANCE**: 2（可见范围 5x5 = 25 个区块）
- 使用伪随机哈希函数确保确定性生成

### 建筑风格 (4种)

| 风格 | 出现概率 | 描述 |
|------|---------|------|
| **TREE** | 20% | 有机树形结构，带树枝和叶片集群 |
| **SPIKES** | 35% | 锥形尖刺阵列 |
| **BLOCKS** | 35% | 堆叠的几何方块 |
| **FLUID** | 10% | 液态变形球体 |

---

## 🔗 动态线缆系统

线缆使用自定义着色器实现 **脉冲动画**：

```glsl
float pulse = step(0.9, fract(vLineDistance * 0.1 - time * 2.0));
vec3 finalColor = mix(color, pulseColor, pulse);
```

- **建筑连接**: 相邻建筑之间的悬垂线缆
- **垂地线缆**: 从建筑顶部垂落至地面
- **动态更新**: 跟随建筑移动实时重新计算贝塞尔曲线

---

## ✋ 手部系统

完全程序化生成的解剖学精确人手模型，右手握持发光花朵：
- 花茎使用 CatmullRom 样条曲线
- 7 片花瓣 + 5 片萼片 + 中心点光源
- 16 个轨道花粉粒子

### 动态手部位置调整

当玩家向上看时，手部会自动下降以避免遮挡视野（特别是天空之眼）：

```javascript
// HandsModel.js - animate() 方法
const pitch = this.camera.rotation.x;

// 关键发现：向上看时 pitch > 0（不是负值！）
// 只在向上看时处理，向下看保持正常位置
const pitchOffset = pitch > 0 ? pitch * 1.5 : 0;

// 减去 pitchOffset 使手部下降
this.handsGroup.position.y = Math.sin(this.time * 2) * 0.02 - pitchOffset;
```

> ⚠️ **重要提示**: `camera.rotation.x` 在向上看时是**正值**，这与直觉相反。多次调试后确认。

---

## 👁️ 天空之眼 (Sky Eye)

巨大的眼球悬浮在天空中，瞳孔会跟踪玩家位置，周期性眨眼。

### 渲染配置

天空之眼必须始终可见，不受任何遮挡：

```javascript
// main.js - createSkyEye() 方法
const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthTest: false,   // 不检查深度，总是渲染
    depthWrite: false,  // 不写入深度缓冲
    fog: false,         // ⭐ 关键：不受雾效影响！
});

// 设置高渲染顺序，确保最后渲染
this.skyEyeGroup.renderOrder = 999;
```

> ⚠️ **重要提示**: 如果不设置 `fog: false`，天空之眼会被场景雾效遮挡！

### 位置与朝向

```javascript
// 世界坐标中的固定位置（不是相机本地坐标！）
this.scene.add(this.skyEyeGroup);  // 添加到场景，不是相机
this.skyEyeGroup.position.set(0, 120, 0);
this.skyEyeGroup.rotation.x = -Math.PI / 2;  // 面朝下方
```

### 瞳孔跟踪

```javascript
// 计算玩家相对于眼睛的 XZ 偏移
const dx = playerPos.x - eyePos.x;
const dz = playerPos.z - eyePos.z;

// 限制瞳孔移动范围
const maxOffset = 3;
const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * 0.02));
const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * 0.02));

// 平滑插值
pupil.position.lerp(new THREE.Vector3(targetX, targetY, 0.1), 0.05);
```

---

## 🔊 程序化音效系统

使用 **Web Audio API** 生成 8-bit 风格声音，符合 1-bit 极简美学：

| 音效 | 类型 | 描述 |
|------|------|------|
| 脚步声 | 方波脉冲 | 低频 (80-120Hz)，短促 |
| 环境音 | 锯齿波振荡 | 持续低频嗡嗡声 (35Hz) |
| 眨眼声 | 正弦波下滑 | 天空之眼眨眼时触发 |
| 昼夜过渡 | 三角波 | 日夜切换时的上升/下降音 |

> 音效在首次点击后初始化（浏览器自动播放限制）

---

## 🌓 昼夜循环系统

每 **5 分钟** 完成一个昼夜周期：

| 时段 | 背景色 | 效果 |
|------|--------|------|
| 日间 | `0x888888` | 正常渲染 |
| 夜间 | `0x222222` | 黑白反转 |

```javascript
// 调整周期时长（秒）
app.dayNight.cycleDuration = 300;  // 默认 5 分钟
```

---

## 🌧️ 天气系统

三种 1-bit 风格天气效果，随机触发：

| 效果 | 描述 | 触发间隔 |
|------|------|---------|
| 静态雪花 | 电视无信号噪点 | 1-3 分钟 |
| 数字雨 | 垂直下落白色短线 | 1-3 分钟 |
| 信号干扰 | 水平条纹闪烁 | 随机短暂 |

```javascript
// 手动触发天气（控制台）
app.weather.forceWeather('static', 10);  // 静态雪花 10 秒
app.weather.forceWeather('rain', 15);    // 数字雨 15 秒
app.weather.forceWeather('glitch', 1);   // 信号干扰 1 秒
```

---

##  光照系统

| 光源 | 类型 | 强度 |
|------|------|------|
| 半球光 | HemisphereLight | 1.2 |
| 扫描灯 | SpotLight | 4.0 (decay=1) |
| 花蕊光 | PointLight | 0.8 |
| 手部光 | DirectionalLight | 0.5 |

---

## 🎬 动画系统

| 类型 | 效果 |
|------|------|
| `ROTATE_FLOAT` | 持续旋转 |
| `BREATHE` | 均匀缩放呼吸 |
| `LIQUID_WOBBLE` | 液态摇晃 |
| `BRANCH_SWAY` | 树枝摇摆 |
| `LEAF_FLUTTER` | 叶片颤动 |

---

##  技术亮点

1. **ES6 模块化架构**: 代码按功能拆分，易于维护
2. **无限世界**: 程序化生成，无边界限制
3. **极简美学**: 1-bit 渲染创造独特视觉风格
4. **有机生成**: 多层级随机参数创造多样性
5. **实时物理**: 动态线缆与移动建筑
6. **性能优化**: 对象池、共享材质、预分配缓存

---

## 🎨 艺术概念

**"嵌合体废墟"** 代表一个由有机与工业元素融合的世界：
- 生长的机械树木
- 连接一切的神经线缆  
- 手持花朵象征人类存在的微弱光芒
- 天空之眼暗示更高维度的观察者

1-bit 渲染将这一切压缩为最基本的二元对立：**存在与虚无**。

---

*Wired Brutalism: Chimera Void* - 一次关于程序化生成与极简主义美学的实验。
