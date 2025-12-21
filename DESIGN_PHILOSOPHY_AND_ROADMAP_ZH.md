# 🏛 Wired Brutalism: Chimera Void - 设计哲学与路线图

## 🏛 哲学核心

### 1. 1-Bit 美学作为“存在与虚无”

在《Chimera Void》中，1-bit 不仅仅是一个复古的风格选择；它是一个形而上学的声明。
- **黑色 (#000000) 代表系统**：绝对、僵化、虚无。
- **白色 (#FFFFFF) 代表自我**：信号、转瞬即逝、观察者。
- **抖动 (Dithering) 代表噪声**：系统与自我之间的摩擦。

### 2. 叙事弧线：“压抑与欲望”（李安式手法）

我们不将交互视为一场游戏，而是一个心理压力锅。
- **天空之眼 (Sky Eye) (权威)**：一个沉默、巨大的存在，要求臣服。
- **花 (The Flower) (欲望)**：一束脆弱的、内在的光。它美丽但危险；把它调得太亮会吸引眼睛的注视。
- **凝视 (The Gaze) (规训)**：注视权威会调暗你自己的光。反抗是可能的，但会导致“系统溢出”（故障）。

---

## 🎭 叙事与心理基础

### 1. 压抑作为应对机制
在这个世界里，生存等同于压抑。为了在天空之眼下安全存在，人们必须调暗内心的“花”——他们的欲望、身份和光芒。游戏不是关于通过力量“获胜”，而是关于在顺从或表达的代价之间导航。

### 2. 反应的原型
- **顺从的倾听者**：保持花朵昏暗并避免眼睛注视的玩家。他们体验到一个稳定虽然沉闷的世界。
- **边界测试者**：在亮与暗之间摇摆的玩家，看系统在反应之前能忍受多少“噪声”。
- **反抗者**：面对权威强行将光调至最高强度的玩家，选择“故障”（系统崩溃）而非安全。

---

## 🚶 玩家旅程

### 第一阶段：觉醒（安静的循环）
- 玩家在极简的 1-bit 环境中醒来。
- **初始感觉**：孤独、沉默。“花”很暗。
- **目标**：通过行走和调整光线强度进行学习。

### 第二阶段：第一眼（直面权威）
- 天空之眼出现在地平线/天空中。
- **初始感觉**：脆弱。
- **系统响应**：如果玩家看向眼睛，屏幕对比度会变硬，音频进入闷响的低通状态。

### 第三阶段：堕入精神状态
- 世界开始生成不同的“房间”（精神状态）。
- **INFO_OVERFLOW**：被过多的信号淹没的感觉。
- **FORCED_ALIGNMENT**：被迫选择“一边”（左或右）的压力。

### 第四阶段：解决（状态快照）
- 运行结束后，玩家会收到一份“状态快照”。
- 这是对他们在运行期间心理选择的非评判性总结。

---

## ⚙️ 技术交互闭环

描述玩家做什么（输入）以及系统响应（反馈）。

### 1. 凝视机制（视角输入）

- **玩家动作**  
  仰望天空之眼（俯仰角 > 45°）。
- **系统反馈（视觉）**  
  `FlowerProp` 强度被强制设定为低值（例如 0.1）。  
  `DitherShader` 将 `uContrast` 从 1.0 偏移至 1.8（使图像更刺眼）。
- **系统反馈（音频）**  
  `AudioSystem` 在 0.5 秒内触发 `LowPassFilter` 转换。环境音变得沉闷。
- **心理效果**  
  玩家感到被“规训”。他们的主观光被权威的客观凝视所抑制。

### 2. 溢出机制（强度输入）

- **玩家动作**  
  在高噪声区域（`INFO_OVERFLOW`）将花的强度增加到 1.0。
- **系统反馈（视觉）**  
  `DitherShader.uTemporalJitter` 从 0.2 增加到 0.9。场景开始“振动”。
- **系统反馈（音频）**  
  高频数字啁啾声（数据噪声）音量增加。
- **心理效果**  
  感官过载。玩家意识到“更多的光”并不意味着“更多的清晰度”；它只会增加噪声。

### 3. 分裂机制（位置输入）

- **玩家动作**  
  在 `FORCED_ALIGNMENT` 中沿着“裂缝”行走。
- **系统反馈（视觉）**  
  `VertexShader` 对裂缝附近的建筑网格应用微妙的“摆动”（正弦波）。
- **系统反馈（音频）**  
  播放双耳节拍，左耳与右耳音调略有失谐（~20Hz 差异）。
- **心理效果**  
  感到“处于中间”。不选边站队产生的不适感。

### 4. 反抗（覆盖键）

- **玩家动作**  
  在 `POLARIZED` 房间中注视天空之眼时按下“覆盖”键（例如 Space 或 Shift）。
- **系统反馈（视觉）**  
  `Flower.intensity` 被强制设定为 1.0。`PostProcessing` 触发“颜色反转”闪烁。`DitherShader` “崩溃”（显示原始三角形 0.1 秒）。
- **系统反馈（音频）**  
  播放响亮的数字“撕裂”声（白噪声爆发）。
- **心理效果**  
  挑衅。打破模拟规则，哪怕只有一秒。

### 5. 状态快照（运行结束）

- **系统动作**  
  根据采样指标计算总结。
- **系统反馈（视觉）**  
  生成独特的程序化 1-bit 噪声图案作为运行的“指纹”。
- **系统反馈（文本）**  
  出现一段简短的、观察性的文本（杨德昌风格）：*“你试图看清一切，结果却什么也没看清。”*

---

## 📊 状态快照：运行时指标与日志

为了生成运行结束的“状态快照”，我们以非侵入方式跟踪玩家行为。

### 6. 数据收集模型

```typescript
interface RunStats {
  duration: number;        // 总秒数
  samples: number;         // 记录的数据点数量
  
  // 花/光
  flowerIntensitySum: number;
  
  // 凝视（天空之眼）
  gazeEvents: number;      // 注视眼睛的次数
  gazeTimeTotal: number;   // 注视的总秒数
  gazeDepthMax: number;    // 达到的最大俯仰角
  
  // 位置/房间
  roomTime: Record<string, number>; // 在每个精神状态房间花费的时间
  onCrackTime: number;     // 在“中立区”（FORCED_ALIGNMENT）花费的时间
  xPositionMin: number;
  xPositionMax: number;
  
  // 反抗
  overrideAttempts: number;
  overrideSuccesses: number;
  overrideTimeTotal: number;
}
```

#### 6.1 记录策略

我们每 **2.0 秒** 采样一次，以避免性能开销。

```javascript
function updateRunStats(deltaTime) {
  runStats.duration += deltaTime;
  
  const isCurrentlyGazing = player.camera.rotation.x > Math.PI / 4;
  const isOverrideActive = player.input.isDown('OVERRIDE');
  
  // 采样周期性数据
  sampleTimer += deltaTime;
  if (sampleTimer > 2.0) {
    runStats.samples++;
    runStats.flowerIntensitySum += flower.intensity;
    sampleTimer = 0;
  }
  
  // 基于事件的跟踪
  if (isCurrentlyGazing && !wasGazingLastFrame) {
    runStats.gazeEvents++;
  }
  if (isCurrentlyGazing) {
    runStats.gazeTimeTotal += deltaTime;
    runStats.gazeDepthMax = Math.max(runStats.gazeDepthMax, camera.rotation.x);
  }
  
  // 跟踪房间类型
  const currentRoom = chunkManager.getCurrentRoomType();
  if (currentRoom !== runStats.currentRoom) {
    runStats.currentRoom = currentRoom;
  }
  runStats.roomTime[currentRoom] = (runStats.roomTime[currentRoom] || 0) + deltaTime;
  
  // 跟踪位置
  runStats.xPositionSum += player.position.x;
  runStats.xPositionMin = Math.min(runStats.xPositionMin, player.position.x);
  runStats.xPositionMax = Math.max(runStats.xPositionMax, player.position.x);
  if (Math.abs(player.position.x) < 5.0) {
    runStats.onCrackTime += deltaTime;
  }
  
  // 跟踪覆盖
  if (isOverrideActive && !wasOverrideActiveLastFrame) {
    runStats.overrideAttempts++;
  }
  if (isOverrideActive) {
    runStats.overrideTimeTotal += deltaTime;
    if (isGlitchingFromOverride) {
      runStats.overrideSuccesses++;
    }
  }
  
  wasGazingLastFrame = isCurrentlyGazing;
  wasOverrideActiveLastFrame = isOverrideActive;
}
```

#### 6.2 归一化阶段

当运行结束时，原始统计被转换为归一化的 0–1 指标：

```typescript
function normalizeRunStats(rawStats: RunStats): NormalizedMetrics {
  const avgFlower = rawStats.flowerIntensitySum / rawStats.samples;
  const gazeRatio = rawStats.gazeTimeTotal / rawStats.duration;
  const overrideRatio = rawStats.overrideTimeTotal / rawStats.duration;
  
  // 玩家在哪个房间待的时间最长？
  const roomRatios = {};
  for (const [room, time] of Object.entries(rawStats.roomTime)) {
    roomRatios[room] = time / rawStats.duration;
  }
  
  // 玩家向左还是向右走得更远？
  const centerX = (rawStats.xPositionMax + rawStats.xPositionMin) / 2;
  const spreadX = (rawStats.xPositionMax - rawStats.xPositionMin) / 2;
  const crackRatio = rawStats.onCrackTime / rawStats.duration;
  
  return {
    avgFlower,      // 0–1
    gazeRatio,      // 0–1
    overrideRatio,  // 0–1
    roomRatios,     // { INFO: 0–1, FORCED: 0–1, IN_BETWEEN: 0–1, POLARIZED: 0–1 }
    crackRatio,     // 0–1
    spreadX,        // 0–? (绝对距离)
  };
}
```

#### 6.3 标签生成

归一化指标被转换为离散的、人类可读的标签：

```typescript
function generateRunTags(metrics: NormalizedMetrics): string[] {
  const tags = [];
  
  // 光强标签
  if (metrics.avgFlower < 0.25) {
    tags.push('QUIET_LIGHT');
  } else if (metrics.avgFlower < 0.6) {
    tags.push('MEDIUM_LIGHT');
  } else {
    tags.push('LOUD_LIGHT');
  }
  
  // 凝视关系标签
  if (metrics.gazeRatio > 0.5) {
    tags.push('HIGH_GAZE');
  } else if (metrics.gazeRatio < 0.15) {
    tags.push('LOW_GAZE');
  }
  
  // 房间主导地位标签
  const dominantRoom = Object.entries(metrics.roomRatios)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];
  
  const roomTagMap = {
    'INFO_OVERFLOW': 'INFO_MAZE',
    'FORCED_ALIGNMENT': 'CRACK_WALKER',
    'IN_BETWEEN': 'INBETWEENER',
    'POLARIZED': 'BINARY_EDGE',
  };
  
  tags.push(roomTagMap[dominantRoom]);
  
  // 位置标签
  if (metrics.crackRatio > 0.3) {
    tags.push('NEUTRAL_SEEKER');
  }
  
  // 反抗标签
  if (metrics.overrideRatio > 0.05) {
    tags.push('RESISTER');
  }
  
  return tags;
}
```

**标签语义：**

- `QUIET_LIGHT`：玩家大多保持花朵变暗。
- `LOUD_LIGHT`：玩家偏好明亮的花朵。
- `MEDIUM_LIGHT`：玩家使用中等光强。
- `HIGH_GAZE`：玩家经常注视眼睛。
- `LOW_GAZE`：玩家避免注视眼睛。
- `INFO_MAZE`：大部分时间在 INFO_OVERFLOW 中。
- `CRACK_WALKER`：大部分时间在 FORCED_ALIGNMENT 中（特别是在裂缝上）。
- `INBETWEENER`：大部分时间在 IN_BETWEEN 中。
- `BINARY_EDGE`：大部分时间在 POLARIZED 中。
- `NEUTRAL_SEEKER`：在裂缝上花费了大量时间（FORCED_ALIGNMENT）。
- `RESISTER`：使用了覆盖机制（至少一次）。

#### 6.4 视觉图案生成

标签驱动一个程序化 1-bit 纹理，在运行结束时短暂显示。

**图案选择逻辑：**

```glsl
// 在 StateSnapshot.frag (Fragment Shader) 中

uniform int uPatternMode;  // 0: noise, 1: stripes, 2: checker, 3: radial
uniform float uDensity;    // 填充密度 (0–1)
uniform float uFrequency;  // 图案频率
uniform float uPhase;      // 偏移/旋转

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float pattern = 0.0;
  
  if (uPatternMode == 0) {
    // 噪声：基于 Perlin/simplex
    pattern = noise(uv * uFrequency);
  } else if (uPatternMode == 1) {
    // 条纹：带角度的平行线
    pattern = sin((uv.x + uv.y * tan(uPhase)) * uFrequency) * 0.5 + 0.5;
  } else if (uPatternMode == 2) {
    // 棋盘格
    pattern = mod(floor(uv.x * uFrequency) + floor(uv.y * uFrequency), 2.0);
  } else if (uPatternMode == 3) {
    // 径向：同心圆或螺旋
    pattern = sin(length(uv - 0.5) * uFrequency + uPhase) * 0.5 + 0.5;
  }
  
  // 应用密度：通过阈值获得 1-bit 输出
  if (pattern > (1.0 - uDensity)) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // 白色
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // 黑色
  }
}
```

**标签到图案的映射：**

```typescript
function getPatternFromTags(tags: string[]): ShaderUniforms {
  let patternMode = 0;
  let density = 0.5;
  let frequency = 8.0;
  let phase = 0.0;
  
  // 主要环境标签决定基础图案
  if (tags.includes('INFO_MAZE')) {
    patternMode = 0;  // 噪声
    frequency = 16.0; // 高频以获得“混乱”感
    density = 0.7;
  } else if (tags.includes('CRACK_WALKER')) {
    patternMode = 1;  // 条纹
    frequency = 12.0;
    phase = Math.PI / 2; // 垂直条纹
  } else if (tags.includes('INBETWEENER')) {
    patternMode = 2;  // 棋盘格
    frequency = 10.0;
    density = 0.6;
  } else if (tags.includes('BINARY_EDGE')) {
    patternMode = 3;  // 径向
    frequency = 10.0;
    phase = Math.random() * Math.PI * 2;
  }
  
  // 次要光强标签修改密度
  if (tags.includes('QUIET_LIGHT')) {
    density -= 0.2; // 稀疏图案
  } else if (tags.includes('LOUD_LIGHT')) {
    density += 0.2; // 稠密图案
  }
  
  // 反抗标签增加混乱度
  if (tags.includes('RESISTER')) {
    frequency *= 1.5;
    density += 0.1;
  }
  
  return {
    uPatternMode: patternMode,
    uDensity: Math.clamp(density, 0.1, 0.9),
    uFrequency: frequency,
    uPhase: phase,
  };
}
```

**显示机制：**

图案被渲染到一个小四边形（例如 256×256 或 512×512）并显示在屏幕右下角，或在玩家下方的地面上短暂覆盖。它在 0.5 秒内淡入，保留 2 秒，然后在 1 秒内淡出。图案无缝循环/平铺以填充四边形。

#### 6.5 文本选择与组成

使用相同的标签，通过预先写好的句子的组合创建文本快照。

**文本库（杨德昌风格）：**

语气是观察性的、非评判性的、略带忧郁的，并且特定于每位玩家所表现出的原型。

```typescript
const textTable = {
  QUIET_LIGHT: [
    {
      zh: "你把自己调暗一点，世界就安静了一点。"
    },
    {
      zh: "你让光保持很低，这似乎有帮助。"
    }
  ],
  
  LOUD_LIGHT: [
    {
      zh: "就算没人开口，你还是把光开得很亮。"
    },
    {
      zh: "你把它开得越亮，看着就越疼。"
    }
  ],
  
  MEDIUM_LIGHT: [
    {
      zh: "你找到了一个折中方案，虽然它从来没感觉过完全对。"
    }
  ],
  
  HIGH_GAZE: [
    {
      zh: "这一趟，你大部分时间都在抬头看。"
    },
    {
      zh: "那只眼睛总在那儿，你停不下来确认。"
    }
  ],
  
  LOW_GAZE: [
    {
      zh: "你很少去确认，那只眼睛还在不在。"
    },
    {
      zh: "你大多把视线放在地上。"
    }
  ],
  
  INFO_MAZE: [
    {
      zh: "你走过很多信号，却没遇到多少回答。"
    },
    {
      zh: "你试图看得越多，理解得越少。"
    }
  ],
  
  CRACK_WALKER: [
    {
      zh: "你在裂缝上待的时间，比大多数人久一点。"
    },
    {
      zh: "中间总是最难站的地方。"
    }
  ],
  
  NEUTRAL_SEEKER: [
    {
      zh: "你更喜欢没什么确定的地方。"
    }
  ],
  
  INBETWEENER: [
    {
      zh: "你总是走进一些，不太算是谁的地方。"
    },
    {
      zh: "不管你去哪儿，你总是被误读。"
    }
  ],
  
  BINARY_EDGE: [
    {
      zh: "你一直走到一个地方，那里所有事都只能是这样或那样。"
    },
    {
      zh: "在纯黑白中，没有呼吸的空间。"
    }
  ],
  
  RESISTER: [
    {
      zh: "你有一次把画面弄坏了，它后来恢复了，但已经不太一样。"
    },
    {
      zh: "你试着说不，一瞬间，世界听了。"
    }
  ]
};
```

---

## 🧠 关卡设计：精神状态空间

### 核心设计理念

我们实现的是**精神状态空间**，而不是线性关卡。

- 我们**不**通过“通关”房间来限制进度。房间在每次游玩（session）中被抽样并重组（就像情绪天气一样），而不是线性解锁。
- 我们**不**为“赢”房间提供显式奖励。
- 我们**确实**提供了理解玩家自身反应模式的隐性奖励。

---

### 1. INFO_OVERFLOW（高噪声，无响应）

**概念框架**

过度连接的焦虑：你向虚空呐喊，虚空以静电噪音回应。这个房间反映了无休止滚动社交媒体的体验，看到如山般的信息却收不到任何反馈、任何对话、任何被倾听的感觉。

**视觉语言**

- 高频抖动图案（0.8–1.0 密度），创造视觉“噪声”。
- 远处的建筑根据花的强度每 2–6 秒闪烁并交换几何形状。
- 数字雨：以不同速度下降的垂直线，像下落的数据包。
- 无明确焦点；眼睛无法在任何地方停留。
- 地平线未明确定义；世界在 30 米内淡入纯噪声。

**音频语言**

- 基础层：持续的低频嗡嗡声（~60 Hz），几乎难以察觉但会产生潜意识的不安。
- 第二层：以不同频率（2–10 kHz）发出随机的哔哔声和啁啾声，产生“错过消息”或“读不出的通知”的感觉。
- 哔哔声的频率和强度随花朵亮度增加而增加。
- 无节奏或模式；声音不可预测，防止听者通过重复产生预期或寻求慰藉。

**交互机制**

```javascript
// INFO_OVERFLOW 特定系统
const noiseDensityMap = {
  0.1: 0.75,  // 调暗光线
  0.3: 0.82,
  0.5: 0.88,
  0.7: 0.95,
  1.0: 1.0    // 全亮度 = 最大噪声
};

const buildingRefreshIntervalMap = {
  0.1: 6.0,   // 变暗：建筑保持稳定
  0.3: 5.0,
  0.5: 3.5,
  0.7: 2.5,
  1.0: 1.5    // 变亮：混乱
};
```

**在 INFO_OVERFLOW 中的玩家旅程**

1. **初始进入**：玩家的本能是调亮光线以“看得更清”。
2. **负反馈**：光线越亮，世界变得越混乱；他们意识到增加光线会适得其反。
3. **适应**：玩家学会将光强度保持在 0.3–0.4 左右（低-中等），找到一种“可忍受”的噪声水平。
4. **挥之不去的怀疑**：即使在最佳设置下，也没有进步感或理解感。信息流不断，却没有任何问题得到解决。
5. **退出选项**：玩家可以穿过房间并退出（没有“陷阱”），但在没有得到答案的情况下离开会产生心理压力。

**设计意图**

这个房间告诉玩家 **更多的输入 ≠ 更多的理解**。这是对当代信息过载现象的冥想，即持续的刺激反而荒谬地导致了麻木和消极。

---

### 2. FORCED_ALIGNMENT（分裂的世界）

**概念框架**

被迫选边站队的压力。不准存在真正的中立。这个房间体现了当代社会/政治话语的极化，即细微差别被折叠成二元对立，而中立被视为背叛。

**视觉语言**

- 一条巨大的垂直裂口将空间分为左、右两半。
- 左侧：整洁、几何化且光照充足的结构（低抖动密度 ~0.4）。美学上洁净但有序得令人压抑。
- 右侧：破碎、有机且部分坍塌的结构（高抖动密度 ~0.7）。混乱但视觉上更“诚实”。
- 裂缝本身：一个纯黑的深渊，看不到底。横跨它意味着进入不确定性。
- 像意识形态横幅一样跨越裂口、紧绷且颤抖的线缆。
- 裂缝处的地面：半透明或闪烁故障，暗示脚下的不稳定性。

**音频语言**

- 左侧：轻柔播放的单一、持续和谐音（大三度，~330 Hz 和 ~550 Hz），唤起稳定与秩序感。
- 右侧：以同样音量播放的不和谐音（三全音或 sus-2 和弦），产生轻微的不安感。
- 裂缝处：两种音调同时播放，产生干涉拍频（~20 Hz），产生令人极度不适的脉动不和谐音，无法长时间忍受。
- 双耳节拍频率根据玩家的 X 位置而变化，形成映射到空间位置的动态音频景观。

**在 FORCED_ALIGNMENT 中的玩家旅程**

1. **初始遭遇**：玩家看到分裂，最初被吸引去探索两侧。
2. **发现舒适区**：完全移向一侧会使世界感觉更“连贯”（抖动更少，地面稳定，音频悦耳）。
3. **心理成本**：但待在一侧意味着接受另一侧的扭曲（它变得嘈杂且不稳定）。玩家成为“抹除”另一种视角的共犯。
4. **中立选项**：玩家可以回到裂缝处，忍受处于两者之间的不适感。这是“觉醒”的选择，但它充满痛苦。
5. **重复选择**：玩家可能会在两侧和裂缝之间摇摆，反复测试边界和代价。

**设计意图**

这个房间将政治/意识形态立场的内部冲突具象化。它不提供“正确”的答案：两边同样有效但也同样局促。裂缝在原则上是“正确”的，但在心理上是难以为继的。游戏对所有三种策略均予以肯定，不做排名。

---

### 3. IN_BETWEEN（故障）

**概念框架**

同时被两个系统误读：在一个语境中被视为噪声而排斥，在另一个语境中仅由于被视为信号而勉强被接受。这个房间是为那些无法整齐地归入既定类别的人准备的——少数族裔、混合体、那些被夹在文化或身份之间的人。

**视觉语言**

- 两个重叠的建筑系统，具有互不兼容的视觉语言：一个是直线的、整洁的，另一个是破碎的、有机的。
- 边界处于发生深度冲突（Z-fighting，纹理争抢），在系统交汇处产生视觉噪声。
- 几何体具有歧义性：部分以一种系统的风格渲染，部分以另一种风格渲染。
- 表面会根据那一刻被哪个系统“宣称主权”而以不同方式反射光线，产生闪烁的外观。
- 地面：双层网格，一层相对于另一层旋转约 30°，产生莫尔纹（moiré）图案。

**音频语言**

- 系统 A：以低音量播放的和谐和弦（纯五度，协和）。
- 系统 B：以同样音量播放的不和谐和弦（三全音或音团）。
- 边界处：两个和弦重叠，产生复杂的声学干涉。
- 玩家的光会在每个系统中触发不同的共鸣（系统 A：确认音；系统 B：警报音）。

**在 IN_BETWEEN 中的玩家旅程**

1. **发现**：玩家遇到不兼容的系统，并意识到他们的反应会随语境而变化。
2. **挫败感**：在系统 A 中奏效的行为会在系统 B 中引发问题，反之亦然。玩家无法“始终保持正确”。
3. **适应**：玩家学会通过在每个系统的领地内遵循该系统的规则来进行导航。
4. **更深层的领悟**：即使是这种适应性的策略在边界处也会失效；玩家发现没有放之四海而皆准的解决方案。
5. **应对**：玩家要么选择心理隔离（分别对待每个系统），要么拥抱歧义（接受矛盾）。

**设计意图**

这个房间反映了人们在多个互不兼容的社会系统中穿梭的亲身经历。这里没有“解决方案”；只有日常的语境切换实践及其产生的心理损耗。游戏肯定了心理隔离和拥抱歧义这两种策略。

---

### 4. POLARIZED（纯粹二元）

**概念框架**

完全臣服于 1-bit 逻辑：没有灰色，没有抖动，只有生硬的决定。在这个房间里，世界已经坍缩成纯粹的二元对立，细微差别被彻底抹除，每一次选择都是一个二元开关。

**视觉语言**

- **零抖动**：纯 1-bit 渲染。世界完全由纯黑和纯白组成，边界极其锐利。
- **无渐变或阴影**：所有表面要么被完全照亮（白色），要么完全处于阴影中（黑色）。
- **几何精度**：所有几何体均由长方形、立方体和线组成。没有曲线，没有有机形状。
- **棋盘格地面**：最标志性的 1-bit 图案，强调黑白二元性。
- **作为边界的电缆**：所有电缆和线条都追踪精确的黑白边界，构成了世界的骨架。
- **天空之眼**：主宰视觉场，巨大到不可议，以 1-bit 同心圆的形式呈现。

**音频语言**

- **二元哔哔声**：唯一的声音是两个频率（例如 440 Hz 和 880 Hz）的清脆数字声，代表“开”和“关”。
- **音调毫无歧义**：没有延音，没有淡入淡出，只有突然的开启和关闭。
- **节奏**：哔哔声遵循一种简单且无情的 4/4 拍节拍，像数字脉冲或时钟滴答声一样，无法逃避且充满机械感。
- **注视强化**：盯着眼睛看时，哔哔声会略微加快，产生一种压力增加的感觉。

**设计意图**

这个房间是游戏的哲学高潮。它代表了二元逻辑的权威终点：在这个世界里，细微差别、妥协和歧义不仅不被鼓励，而且在技术上是不可能的。“覆盖”并非一种“超能力”，而是一种挑衅性的姿态——因其徒劳而显得美丽。

---

## 🎛 参数参考

### 着色器 Uniforms

```glsl
// 所有房间的全局参数
uniform float uNoiseDensity;    // 0–1，控制抖动图案密度
uniform float uThresholdBias;   // -0.5 到 0.5，偏移黑白平衡
uniform float uTemporalJitter;  // 0–1，控制抖动的时间轴动画
uniform float uContrast;        // 1.0+ 控制整体对比度
uniform float uCRTCurvature;    // 0–0.1，CRT 监视器曲线畸变
uniform float uScanlineIntensity; // 0–1，水平扫描线效果

// 顶点位移（故障）
uniform float uGlitchAmount;    // 0–1，顶点位移幅度
uniform float uGlitchSpeed;     // Hz，故障动画频率

// 颜色效果
uniform float uColorInversion;  // 0–1，0=正常，1=完全反转
uniform float uSaturation;      // 0–1，0=灰度，1=全彩
```

---

## 🛠 技术路线图

### 第一阶段：地基（着色器与状态）

**持续时间**：2–3 周

**目标：**

- 重构 `ChunkManager` 以支持 `roomType` 枚举及每个房间的单独配置。
- 升级 `DitherShader`，添加所有必需的 uniform 以及时间轴动画支持。
- 实现基本的“花朵”强度控制（手动控制及通过“注视”自动控制）。
- 建立 `RunStats` 数据收集基础架构（非侵入式后台记录）。

**交付物：**

- `ChunkManager.js` 能够生成并管理分配了 `roomType` 的分块（chunk）。
- `DitherShader.js` 公开 `uNoiseDensity`、`uThresholdBias`、`uTemporalJitter`、`uContrast` 作为动态更新的 uniform。
- `FlowerProp.js` 支持平滑插值的 `setIntensity(0–1)`。
- `RunStats` 对象在整个会话（session）中保持并积累数据。

**验收标准：**

- 在 INFO_OVERFLOW 和 POLARIZED 房间之间切换会产生可见的着色器变化。
- 花朵强度可以被手动控制并显示平滑的视觉反馈。
- 无性能退化；帧率保持稳定。

---

### 第二阶段：规训（机制）

**持续时间**：2–3 周

**目标：**

- 实现“注视”机制：凝视天空之眼时自动降低光照强度。
- 集成音频滤波（注视时启用低通滤波）。
- 添加触觉反馈（若平台支持）。
- 实现摄像机俯仰检测及平滑的状态切换。

**交付物：**

- `Controls.js` 检测“注视”状态（俯仰角 > 45°）并广播事件。
- “花朵”通过自动插值强度来响应“注视”。
- `AudioSystem` 在注视时平滑地应用低通滤波器。
- 触觉脉冲模式实现（注视开始时单次脉冲，注视过程中周期性脉冲）。

**验收标准：**

- 抬头注视明显带有“惩罚感”（光线变暗、声音变闷、震动）。
- 效果平滑，不突兀。
- 玩家在游戏开始的前 30 秒内自然习得“注视”规则。

---

*文档版本：1.0（中文）*
