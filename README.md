# Wired Brutalism: Chimera Void

一个基于 Three.js 的 **1-bit 抖动渲染** 交互式 3D 体验作品。玩家穿行于程序化生成的嵌合体废墟中，手持一朵发光的花。

> **这不仅是一个游戏，而是一个心理压力系统。** 通过视觉、音频和交互机制的紧密耦合，传达关于权威、欲望和反抗的叙事。

---

## 🎭 核心概念

### 1-Bit 哲学：存在与虚无

在这个世界中，一切都被压缩为二元对立：

| 符号 | 含义 | 隐喻 |
|------|------|------|
| **黑色 (0)** | 系统、规则、权威 | 僵化的绝对性 |
| **白色 (1)** | 自我、信号、欲望 | 转瞬即逝的存在 |
| **抖动区域** | 边界、摩擦、噪声 | 被误读的中间地带 |

---

## 🎮 操作说明

| 按键 | 功能 | 深层含义 |
|------|------|---------|
| `W / A / S / D` | 移动 | 穿行于精神状态之间 |
| `空格键` | 跳跃 | 短暂的超越 |
| `鼠标` | 视角控制 | 选择凝视的方向 |
| `Q / E` | 调节花朵亮度 | 降低 / 增强内在欲望 |
| `滚轮` | 调节花朵亮度 | 控制欲望的强度 |
| `Shift` | 反抗/覆盖 | 对抗系统的规训 |
| `P` | 截图保存 | 记录这个世界的瞬间 |
| `点击` | 进入游戏 | 接受这个世界的邀请 |

---

## 🔄 核心游戏机制

### 机制一：凝视系统 (Gaze Mechanic)

当你向上看时，你正在直视天空之眼——那个始终注视着你的权威象征。

```
触发条件: 视角向上超过 45°
```

**系统响应:**

| 层面 | 效果 | 代码位置 |
|------|------|---------|
| **视觉** | 花朵强度被压制到 0.1-0.5 | `GazeMechanic.ts:82` |
| **音频** | 低通滤波器激活，声音变得沉闷 | `AudioSystem.ts:285` |
| **着色器** | 对比度从 1.0 → 1.8，画面更刺眼 | `DitherShader.ts:156` |
| **心理** | 玩家感受到被"规训"的压力 | — |

```typescript
// GazeMechanic.ts - 核心检测逻辑
const pitch = camera.rotation.x;  // 正值 = 向上看
const isGazingUp = pitch > Math.PI / 4;  // 45° 阈值

if (isGazingUp) {
    const gazeIntensity = (pitch - Math.PI/4) / (Math.PI/2 - Math.PI/4);
    this.onGazeStart(gazeIntensity);
}
```

> ⚠️ **技术细节**: `camera.rotation.x` 向上看时为**正值**，向下看时为负值。

---

### 机制二：花朵强度系统 (Flower Intensity)

你手中的花是你内在欲望的外在表现。它的亮度由你控制，但会带来后果。

| 强度范围 | 视觉效果 | 系统反应 |
|---------|---------|---------|
| `0.0 - 0.3` | **微弱光芒**：尘埃收敛，花苞紧闭，体积微小 | 安全，不被注意 |
| `0.3 - 0.7` | **柔和发光**：粒子浮动，花瓣微开，呼吸节奏平缓 | 开始被天空之眼关注 |
| `0.7 - 1.0` | **强烈光芒**：粒子疾驰，完全盛开，**屏幕边缘脉冲溢出** | 吸引全部注视，触发高压反馈 |

**状态触发说明:**

花朵强度由玩家通过**鼠标滚轮**控制，范围是 `0.0` 到 `1.0`。不同的强度范围会触发不同的系统反应：

| 强度范围 | 触发方式 | 设计意图 |
|---------|---------|---------|
| **0.0 - 0.3** | 滚轮向下（降低） | 隐藏自己的欲望，躲避监视 |
| **0.3 - 0.7** | 滚轮调至中间范围 | 中等风险，开始被系统"看见" |
| **0.7 - 1.0** | 滚轮向上（提高） | 高度暴露，系统压力最大 |

**与其他机制的联动:**

| 联动机制 | 效果 |
|---------|------|
| 凝视系统 | 向上凝视天空之眼时（pitch > 45°），花朵强度被**压制**到 0.1-0.5 |
| 反抗系统 | 成功触发反抗后，花朵强度被**强制拉满**到 1.0 |
| 行为记录 | `avgIntensity < 0.3` 会被标记为 `QUIET_LIGHT`（顺从者） |

**隐喻含义:**

> 花朵代表你的**内在欲望**——保持低强度 = 压抑自我，换取安全；提升高强度 = 表达欲望，承受被注视的压力。这是游戏核心心理系统的一部分：**你愿意为了安全牺牲多少自我表达？**

**核心联动:**

```typescript
// FlowerProp.ts - 三态视觉系统
animateFlower(...) {
    // 0.0-0.3: Dim State
    // 0.3-0.7: Soft State
    // 0.7-1.0: Intense State

    // 状态驱动的自发光材质联动
    assets.matFlowerCore.emissiveIntensity = emissiveParams[state];
    
    // 高强度触发 Shader 边缘溢出
    if (intensity > 0.7) {
        // DitherShader 渲染屏幕边缘脉冲
    }
}
```

---

### 机制三：反抗系统 (Override Mechanic)

在特定条件下，你可以选择反抗系统的压制。这是你唯一的"武器"。

```
触发条件: 按住 Shift + 凝视天空之眼 + 身处 POLARIZED 房间
按住时间: 1 秒
冷却时间: 3 秒
```

**反抗效果:**

| 阶段 | 时长 | 效果 |
|------|------|------|
| 蓄力 | 0-1秒 | 屏幕边缘出现脉冲闪烁（进度反馈） |
| 爆发 | 0.1秒 | 屏幕颜色瞬间反转 |
| 恢复 | 0.5秒 | 花朵强度强制为 1.0 |

**界面状态指示器:**

在屏幕左下角会显示实时调试信息：

```
POS: X, Z | ROOM_TYPE | ↑45° ⬆️SHIFT 👁️GAZE [50%]
```

| 指示器 | 含义 |
|--------|------|
| `↑45°` | 当前视角 pitch 角度（正值=向上看） |
| `⬆️SHIFT` | Shift 键按下时显示 |
| `👁️GAZE` | 满足凝视条件时显示（pitch > 45°） |
| `[50%]` | Override 蓄力进度（0-100%） |

```typescript
// OverrideMechanic.ts - 反抗核心逻辑
if (this.isGazingEye && this.isHoldingShift && this.currentRoom === 'POLARIZED') {
    this.chargeTime += deltaTime;

    if (this.chargeTime >= this.activationThreshold) {
        this.triggerOverride();
        this.cooldownRemaining = 3.0;
    }
}
```

---

### 机制四：房间状态系统 (Room States)

世界被划分为四种"心理房间"，每种代表不同的精神状态。你的位置决定你当前所处的状态。

| 房间类型 | 视觉特征 | 音频特征 | 心理体验 |
|---------|---------|---------|---------|
| **INFO_OVERFLOW** | 85% 抖动，高对比度，剧烈时间抖动 | 密集噪声 | 被过多信号淹没，无法思考 |
| **FORCED_ALIGNMENT** | 建筑网格"摆动"，Z-Fighting | 双耳节拍 (~20Hz 差异) | 被迫选边，生理不适感 |
| **IN_BETWEEN** | 35% 抖动，轻微故障 | 不谐和声 | 被系统误读，身份模糊 |
| **POLARIZED** | 0% 抖动，纯 1-bit 黑白 | 极简单音 | 绝对的二元对立，无中间地带 |

```typescript
// RoomConfig.ts - 房间配置示例
export const ROOM_CONFIGS: Record<RoomType, RoomConfig> = {
    INFO_OVERFLOW: {
        ditherAmount: 0.85,
        contrast: 1.2,
        temporalJitter: 0.6,
        audioProfile: 'noise_dense',
        buildingDensity: 1.5
    },
    POLARIZED: {
        ditherAmount: 0.0,
        contrast: 2.0,
        temporalJitter: 0.0,
        audioProfile: 'minimal',
        buildingDensity: 0.5
    }
    // ...
};
```

---

## 🛤️ 玩家旅程：四个阶段

### 阶段一：觉醒 (Awakening)

**场景:** 玩家出生在一个安静的区域，周围是低矮的建筑。

| 元素 | 状态 | 目的 |
|------|------|------|
| 天空之眼 | 关闭或微睁 | 给予安全感 |
| 花朵 | 低强度 | 引导探索 |
| 环境 | IN_BETWEEN 状态 | 中性介绍 |

**玩家行为预期:** 熟悉移动，开始探索，发现花朵可以调节。

---

### 阶段二：第一眼 (First Eye Contact)

**场景:** 玩家偶然或有意地向上看，第一次与天空之眼对视。

```
触发: 视角向上 > 45° 持续 2 秒
```

| 系统响应 | 效果 |
|---------|------|
| 天空之眼 | 完全睁开，瞳孔锁定玩家 |
| 花朵 | 强度被压制 |
| 音频 | 低频嗡鸣，低通滤波 |
| 着色器 | 对比度提升，画面变得刺眼 |

**心理效果:** 玩家感受到被"看见"的不适，直觉想要低头。

---

### 阶段三：堕入精神状态 (Descent into Mental States)

**场景:** 玩家开始在不同的房间之间移动，体验精神状态的转换。

**状态转换地图:**

```
     INFO_OVERFLOW ←→ FORCED_ALIGNMENT
           ↑               ↑
           ↓               ↓
      IN_BETWEEN   ←→   POLARIZED
```

每次跨越房间边界时：
- 着色器参数平滑过渡 (0.5秒)
- 音频配置混合切换
- UI 提示当前状态（可选）

---

### 阶段四：解决 (Resolution)

**场景:** 每次日落时，系统基于玩家的行为模式生成一份"状态快照"并短暂展示。

**触发时机:** 昼夜循环从白天切换到夜晚时自动触发（约每 4-6 分钟一次）

**展示方式:**
- 屏幕出现 1-bit 风格图案覆盖层（渐入 1.5 秒）
- 中央显示一句观察性文字
- 约 8 秒后自动消散

---

#### 行为标签触发条件

| 标签 | 触发条件 | 含义 |
|------|---------|------|
| `QUIET_LIGHT` | `avgFlower < 0.25` | 平均花朵强度低于 25% |
| `MEDIUM_LIGHT` | `0.25 ≤ avgFlower < 0.6` | 中等强度 |
| `LOUD_LIGHT` | `avgFlower ≥ 0.6` | 高强度，完全暴露 |
| `HIGH_GAZE` | `gazeRatio > 0.5` | 凝视天空之眼时间超过 50% |
| `LOW_GAZE` | `gazeRatio < 0.15` | 凝视时间少于 15% |
| `INFO_MAZE` | 在 `INFO_OVERFLOW` 房间待得最久 | 信息过载偏好 |
| `CRACK_WALKER` | 在 `FORCED_ALIGNMENT` 房间待得最久 | 裂缝行走者 |
| `INBETWEENER` | 在 `IN_BETWEEN` 房间待得最久 | 中间地带偏好 |
| `BINARY_EDGE` | 在 `POLARIZED` 房间待得最久 | 二元边界偏好 |
| `NEUTRAL_SEEKER` | `crackRatio > 0.3` | 在中性区域停留超过 30% 时间 |
| `RESISTER` | `overrideRatio > 0.05` | 使用反抗机制超过 5% 时间 |

> **注意:** 玩家可以同时获得多个标签，但显示文字时按优先级选择最高的一条。

#### 标签维度分组

标签系统按不同维度分组，每个维度独立评估：

| 维度 | 可能的标签 | 规则 |
|------|-----------|------|
| **光强** | `QUIET_LIGHT` / `MEDIUM_LIGHT` / `LOUD_LIGHT` | 三选一（互斥） |
| **凝视** | `HIGH_GAZE` / `LOW_GAZE` / 无 | 只有极端时才标记 |
| **主导房间** | `INFO_MAZE` / `CRACK_WALKER` / `INBETWEENER` / `BINARY_EDGE` | 选待得最久的一个 |
| **特殊行为** | `NEUTRAL_SEEKER` / `RESISTER` | 满足条件就添加（可叠加） |

典型玩家会获得 **2-4 个标签**，从多个角度描述行为模式。

---

#### 三种玩家原型

| 原型 | 行为特征 | 典型标签组合 |
|------|---------|-------------|
| **顺从的倾听者** | 保持低强度，避免凝视 | `QUIET_LIGHT`, `LOW_GAZE` |
| **边界测试者** | 在不同房间间徘徊，中等强度 | `MEDIUM_LIGHT`, `INBETWEENER` |
| **反抗者** | 高强度，频繁使用反抗机制 | `LOUD_LIGHT`, `RESISTER`, `HIGH_GAZE` |

```typescript
// RunStatsCollector.ts - 行为标签生成核心逻辑
generateTags(): BehaviorTag[] {
    const metrics = this.normalize();
    const tags: BehaviorTag[] = [];

    // 光强标签
    if (metrics.avgFlower < 0.25) tags.push('QUIET_LIGHT');
    else if (metrics.avgFlower < 0.6) tags.push('MEDIUM_LIGHT');
    else tags.push('LOUD_LIGHT');

    // 凝视标签
    if (metrics.gazeRatio > 0.5) tags.push('HIGH_GAZE');
    else if (metrics.gazeRatio < 0.15) tags.push('LOW_GAZE');

    // 反抗标签
    if (metrics.overrideRatio > 0.05) tags.push('RESISTER');

    return tags;
}
```

---

## 📊 交互闭环图解

```
┌─────────────────────────────────────────────────────────────┐
│                      玩家输入层                              │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│  视角方向    │  滚轮滚动    │  移动位置    │   Shift 按键     │
│  (凝视)      │  (强度)      │  (房间)      │   (反抗)        │
└──────┬──────┴──────┬──────┴──────┬──────┴───────┬──────────┘
       │             │             │              │
       ▼             ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      核心机制层                              │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ GazeMechanic│ FlowerProp  │ RoomConfig  │OverrideMechanic  │
└──────┬──────┴──────┬──────┴──────┬──────┴───────┬──────────┘
       │             │             │              │
       └──────────┬──┴─────────────┴──────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      反馈输出层                              │
├───────────────────┬─────────────────┬──────────────────────┤
│   DitherShader    │   AudioSystem   │   RunStatsCollector  │
│   (视觉反馈)       │   (听觉反馈)     │   (行为记录)         │
└───────────────────┴─────────────────┴──────────────────────┘
```

---

## 📖 Documentation | 📖 文档

Detailed design philosophy, technical interaction loops, and project roadmap are available in:
详细的设计哲学、技术交互闭环和项目路线图请参阅：

- [English Version (EN)](DESIGN_PHILOSOPHY_AND_ROADMAP_EN.md)
- [中文版本 (ZH)](DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md)

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
├── tsconfig.json           # TypeScript 配置
├── README.md               # 本文档
├── styles/
│   └── main.css            # 样式表（扫描线效果等）
└── src/
    ├── main.ts             # 主程序入口
    ├── types.ts            # 类型定义
    ├── audio/
    │   └── AudioSystem.ts  # 程序化音效系统
    ├── shaders/
    │   └── DitherShader.ts # 1-bit 抖动着色器 + 线缆脉冲着色器
    ├── player/
    │   ├── Controls.ts     # 第一人称移动控制
    │   ├── HandsModel.ts   # 解剖学精确的手部模型
    │   └── FlowerProp.ts   # 手持发光花朵
    ├── world/
    │   ├── ChunkManager.ts # 无限地形区块管理
    │   ├── SharedAssets.ts # 共享材质和几何体
    │   ├── BuildingFactory.ts # 建筑生成器
    │   ├── FloraFactory.ts # 树木/植物生成器
    │   ├── FloorTile.ts    # 地板纹理生成
    │   ├── CableSystem.ts  # 动态线缆系统
    │   ├── WeatherSystem.ts # 天气效果系统
    │   ├── DayNightCycle.ts # 昼夜循环系统
    │   └── SkyEye.ts       # 天空之眼
    └── utils/
        ├── hash.ts         # 确定性伪随机哈希
        └── ObjectPool.ts   # 对象池（性能优化）
```

---

## 🛠️ 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| **TypeScript** | ^5.9.3 | 类型安全的 JavaScript 超集 |
| **Three.js** | ^0.173.0 | 3D 渲染引擎（ES6 模块版本） |
| **@types/three** | ^0.173.0 | Three.js 类型定义 |
| **Vite** | ^5.0.0 | 现代前端构建工具 |
| **Vitest** | ^4.0.16 | 单元测试框架 |
| **ESLint** | ^9.39.2 | 代码检查工具（@antfu/eslint-config） |
| **模块系统** | ES6 Import Map | 浏览器原生模块支持 |

### 类型检查

```bash
npm run typecheck   # 运行 TypeScript 类型检查
npm run build       # 类型检查 + 生产构建
```

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

```typescript
// HandsModel.ts - animate() 方法
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

```typescript
// SkyEye.ts - createGeometry() 方法
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

动态昼夜循环，带随机元素：

| 特性 | 描述 |
|------|------|
| 周期时长 | 4-6 分钟（随机） |
| 夜间强度 | 背景深浅随机变化 |
| 过渡天气 | 日落30%/日出20%概率触发 |
| 日食事件 | 极小概率白天反转 |

```javascript
// 调整/测试
app.dayNight.cycleDuration = 10;  // 快速周期
app._triggerSolarEclipse(performance.now()/1000);  // 手动日食
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

## 🔧 调试命令

在浏览器控制台 (F12) 中输入以下命令进行测试：

### 天气系统
```javascript
app.weather.forceWeather('static', 10);  // 静态雪花 10秒
app.weather.forceWeather('rain', 15);    // 数字雨 15秒
app.weather.forceWeather('glitch', 1);   // 信号干扰 1秒
```

### 昼夜循环
```javascript
app.dayNight.cycleDuration = 10;  // 快速测试（10秒周期）
app.dayNight.triggerSolarEclipse(performance.now()/1000, {
    shaderQuad: app.composerScene.children[0],
    weather: app.weather,
    audio: app.audio
});  // 手动触发日食
```

### 天空之眼
```javascript
app.skyEye.triggerBlink(app.audio);  // 手动眨眼
```

---

## 技术亮点

### 架构层面

| 模块 | 技术特点 | 关键文件 |
|------|---------|---------|
| **类型系统** | 完整 TypeScript 定义，5000+ 行类型安全代码 | `types.ts` |
| **模块化** | ES6 按功能域拆分，高内聚低耦合 | `src/` 目录结构 |
| **程序化生成** | 确定性哈希 + 无限区块管理 | `ChunkManager.ts` |
| **着色器管线** | 自定义后期处理 + 多效果合成 | `DitherShader.ts` |
| **音频引擎** | Web Audio API 程序化音效 | `AudioSystem.ts` |

### 游戏机制层面

| 系统 | 创新点 | 实现方式 |
|------|-------|---------|
| **凝视检测** | 视角与系统压制的实时联动 | 相机 pitch + 阈值检测 |
| **心理房间** | 空间位置映射精神状态 | 区块坐标 → 配置查表 |
| **行为追踪** | 非侵入式采样 + 标签生成 | 定时器 + 统计聚合 |
| **反抗机制** | 玩家主动对抗系统规训 | 状态机 + 冷却管理 |

### 性能优化

- **对象池**: 避免 GC 抖动，流畅 60fps
- **共享材质**: 减少 Draw Call，提升渲染效率
- **LOD 系统**: 远距离区块简化渲染
- **预分配缓存**: 避免运行时内存分配

---

## 🎨 艺术概念

**"嵌合体废墟"** 代表一个由有机与工业元素融合的世界：

| 视觉元素 | 象征意义 |
|---------|---------|
| 生长的机械树木 | 自然与技术的融合/冲突 |
| 连接一切的神经线缆 | 无处不在的监控网络 |
| 手持的发光花朵 | 人类存在的微弱光芒与内在欲望 |
| 天空之眼 | 更高维度的观察者、权威与规训 |
| 1-bit 黑白 | 存在与虚无的二元对立 |

> *"在这个世界里，灰色是一种抗争。"*

---

## 🔗 技术文档索引

| 文档 | 内容 | 推荐读者 |
|------|------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 代码架构与开发规范 | 开发者 |
| [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md) | 程序化音效系统详细文档 | 开发者/音效设计师 |
| [DESIGN_PHILOSOPHY_EN.md](DESIGN_PHILOSOPHY_AND_ROADMAP_EN.md) | 设计哲学与路线图 (英文) | 设计师/研究者 |
| [DESIGN_PHILOSOPHY_ZH.md](DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md) | 设计哲学与路线图 (中文) | 设计师/研究者 |

---

*Wired Brutalism: Chimera Void* - 一次关于程序化生成、极简主义美学与心理体验设计的实验。

---

## 🧭 开发方法论

本项目采用**渐进式架构**方法，而非预先过度设计。

### 核心原则

> **"Make it work, make it right, make it fast."** — Kent Beck

| 阶段 | 策略 |
|------|------|
| **早期** | 先让功能跑起来，不追求完美抽象 |
| **中期** | 当文件超过阈值（如 300 行）时触发重构 |
| **后期** | 提取可复用模式，引入架构层 |

### 项目第一天就做的事

| 配置 | 原因 |
|------|------|
| ESLint (推荐 @antfu/eslint-config) | 一行命令，代码风格统一 |
| `src/config/` 目录 | 常量集中管理，便于调参 |
| 测试框架 (vitest) | 纯函数立即可测 |
| `ARCHITECTURE.md` | 记录架构决策和重构信号 |

### 不需要提前做的事

- ❌ 复杂的抽象层（等问题出现再引入）
- ❌ 预先拆分小文件（让文件自然生长到需要拆分的时候）
- ❌ 过早优化性能（先正确，再快）

### 重构信号

在 `ARCHITECTURE.md` 中定义触发条件：

```markdown
## 重构信号
- 单文件超过 300 行 → 考虑拆分
- 相同逻辑出现 3 次 → 提取为共享模块
- 测试变得困难 → 依赖注入/解耦
```

> **架构是生长出来的，不是规划出来的。**

---

## 📊 项目统计

| 指标 | 数值 |
|------|------|
| TypeScript 代码 | ~5,000 行 |
| 设计文档 | ~180,000 行 |
| 核心机制 | 4 个 |
| 房间状态 | 4 种 |
| 建筑风格 | 4 类 |
| 天气效果 | 3 种 |
| 玩家原型 | 3 类 |
| 行为标签 | 11 种 |
