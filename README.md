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

## 🎨 核心视觉效果

### 1-Bit 抖动着色器 (Bayer Dithering)
作品的核心视觉特征是 **1-bit 抖动渲染**，将所有颜色压缩为纯黑与纯白。使用 **4x4 Bayer 抖动矩阵** 实现灰度过渡：

```glsl
float bayer4x4(vec2 uv) {
    // 16级阈值矩阵，产生有序抖动效果
}
```

渲染流程：
1. 场景以 50% 分辨率渲染到 RenderTarget
2. 全屏 Quad 应用抖动着色器
3. 输出最终的 1-bit 画面

### 扫描线叠加 (Scanlines)
CRT 风格的扫描线效果，通过 CSS 实现：
- 水平条纹模拟阴极射线管
- RGB 色彩偏移模拟像素格栅

---

## 🏗️ 程序化生成系统

### Chunk 系统
场景使用 **无限程序化地形** 系统：
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

### 树木系统 (TREE 风格)
最复杂的生成系统，包含：
- **多段树干**: 使用锥度和弯曲模拟自然生长
- **分层树冠**: 2-7 层树枝层
- **3 种轮廓**: 圆锥形 / 球形 / 倒圆锥形
- **叶片集群**: 使用四面体线框
- **果实**: 10% 概率生成发光果实

---

## 🔗 动态线缆系统

### 线缆着色器
线缆使用自定义着色器实现 **脉冲动画**：

```glsl
float pulse = step(0.9, fract(vLineDistance * 0.1 - time * 2.0));
vec3 finalColor = mix(color, pulseColor, pulse);
```

### 线缆类型
- **建筑连接**: 相邻建筑之间的悬垂线缆
- **垂地线缆**: 从建筑顶部垂落至地面
- **动态更新**: 跟随建筑移动实时重新计算贝塞尔曲线

---

## ✋ 手部系统

### 解剖学精确的手部模型
完全程序化生成的人手模型：

**手指结构** (每根手指):
- 近端指骨 (Proximal Phalanx)
- 中间指骨 (Middle Phalanx)  
- 远端指骨 (Distal Phalanx)
- PIP / DIP 关节球

**拇指结构**:
- 掌骨 (Metacarpal)
- 近端指骨 + 远端指骨

**解剖学特征**:
- 大鱼际肌 (Thenar)
- 小鱼际肌 (Hypothenar)
- 手腕连接前臂

### 右手握花姿势
右手握持一朵发光的花：
- 花茎使用 CatmullRom 样条曲线
- 7 片花瓣 + 5 片萼片
- 中心发光点光源
- 16 个轨道花粉粒子

---

## 🌸 花朵动画

| 动画类型 | 描述 |
|---------|------|
| `PETAL_BREATHE` | 花瓣呼吸开合 |
| `SEPAL_FLOAT` | 萼片漂浮旋转 |
| `DUST_ORBIT` | 花粉粒子轨道运动 |

---

## 👁️ 天空之眼 (Sky Eye)

固定在玩家视野远处的抽象装置：
- 4 层同心圆环
- 每层独立旋转速度
- 中心圆形瞳孔

---

## 🔦 光照系统

| 光源 | 类型 | 用途 |
|------|------|------|
| 半球光 | HemisphereLight | 全局环境光 |
| 扫描灯 | SpotLight | 跟随玩家的探照灯 |
| 花蕊光 | PointLight | 手持花朵发光 |
| 手部光 | DirectionalLight | 手部补光 |

---

## 🏃 物理与移动

- **重力**: 9.8 × 3.0
- **移动速度**: 60.0 单位/秒
- **跳跃冲量**: 15.0
- **视角高度**: 2.0 单位
- **行走晃动**: 基于正弦波的视角抖动

---

## 🎬 动画系统

### 场景动画类型

| 类型 | 效果 |
|------|------|
| `ROTATE_FLOAT` | 持续旋转 |
| `BREATHE` | 均匀缩放呼吸 |
| `SQUISH` | 不规则挤压变形 |
| `LIQUID_WOBBLE` | 液态摇晃 |
| `BRANCH_SWAY` | 树枝摇摆 |
| `LEAF_FLUTTER` | 叶片颤动 |

### 移动建筑
非 TREE 类型建筑 70% 概率可移动：
- 使用正弦函数的漫游运动
- 线缆跟随实时重计算

---

## 📦 依赖

- **Three.js r128**: 核心 3D 渲染引擎
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  ```

---

## 🎨 材质清单

| 变量 | 颜色 | 用途 |
|------|------|------|
| `matSolid` | #333333 | 实心建筑 |
| `matDark` | #050505 | 深色尖刺 |
| `matWire` | #333333 | 线框叶片 |
| `matPlasma` | #111111 | 发光果实 |
| `matTreeBark` | #252525 | 树干 |
| `matFlowerPetal` | #aaaaaa | 半透明花瓣 |
| `matFlowerStem` | #000000 | 花茎 |
| `matFlowerCore` | #ffffff | 发光花蕊 |
| `matLiquid` | #111111 | 液态球体 |

---

## 📐 几何体

预实例化几何体以优化性能：
- `BoxGeometry` - 方块建筑
- `IcosahedronGeometry` - 有机 blob
- `SphereGeometry` - 液态球
- `TorusKnotGeometry` - 装饰结
- `ConeGeometry` - 尖刺/树枝
- `TetrahedronGeometry` - 叶片
- `CylinderGeometry` - 树干

---

## 🖥️ 渲染设置

```javascript
const renderScale = 0.5;  // 50% 分辨率渲染
renderer.setPixelRatio(1); // 1:1 像素比
renderer.shadowMap.type = THREE.BasicShadowMap; // 硬阴影
scene.fog = new THREE.Fog(0x888888, 20, 110); // 灰色雾效
```

---

## 📄 文件结构

```
1bit/
├── 1-bit.html     # 主程序 (单 HTML 文件)
└── README.md      # 本文档
```

---

## 🚀 运行方式

1. 直接在浏览器中打开 `1-bit.html`
2. 点击画面进入游戏
3. 使用 WASD + 鼠标探索

---

## 💡 技术亮点

1. **纯前端单文件**: 无需服务器，双击即可运行
2. **无限世界**: 程序化生成，无边界限制
3. **极简美学**: 1-bit 渲染创造独特视觉风格
4. **有机生成**: 多层级随机参数创造多样性
5. **实时物理**: 动态线缆与移动建筑

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
