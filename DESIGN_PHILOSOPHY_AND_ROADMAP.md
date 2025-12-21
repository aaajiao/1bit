# Wired Brutalism: Design Philosophy & Roadmap | 设计哲学与路线图

> "In a world of 0 and 1, I am not allowed to be 0.5."
> “在一个只有 0 和 1 的世界里，我不被允许成为 0.5。”

This document synthesizes the artistic vision, narrative philosophy, mental-state level design, and technical roadmap for *Wired Brutalism: Chimera Void*. It combines the "Ang Lee" narrative interpretation with the "Mental State Rooms" design proposed for the 1-bit 3D prototype.

这份文档综合了 *Wired Brutalism: Chimera Void* 的艺术愿景、叙事哲学、“精神状态空间”关卡设计以及技术路线图，将“李安式”的叙事解读与当前 1-bit 3D 原型结合起来。

---

## 🔀 Reading Guide | 阅读指引

- If you are a **developer**, focus on:
  - ⚙️ Technical Interaction Loop
  - 🧠 Mental State Rooms (Tech Profiles)
  - 🛠 Technical Roadmap

- 如果你是 **策展人/写作者**，可以重点阅读：
  - 🌑 Philosophical Core
  - 🚶 The Player Journey
  - 🧠 Level Design: Mental State Rooms

---

## 🌑 Philosophical Core: The Aesthetics of Repression | 哲学核心：压抑美学

### 1. 1-Bit as "Existence vs. Void" | 1-Bit 作为“存在与虚无”

In this project, 1-bit is not just a retro style; it is an **extreme abstraction of existence**.
在这个项目中，1-bit 不仅仅是一种复古风格，它是对**存在的一种极端抽象**。

- **Black is Void (The System) | 黑色是虚无（系统）**
  The oppressive, silent, infinite brutalist structure. It represents immutable rules and the overwhelming "super-ego" of the world.
  压抑、沉默且无限的粗野主义结构。它代表了不可改变的规则和世界压倒性的“超我”。

- **White is Existence (The Self) | 白色是存在（自我）**
  Light is the only proof of being. Dithered gradients are the struggle of the individual to manifest within the void.
  光是存在的唯一证明。抖动的渐变是个体试图在虚空中显形时的挣扎。

- **Dithering as Noise | 抖动即噪点**
  Visual noise represents the instability of reality and the anxiety of the "in-between" state.
  视觉上的噪点代表了现实的不稳定性以及处于“中间状态”的焦虑。

### 2. Narrative Arc: "Repression & Desire" (The Ang Lee Approach) | 叙事弧光：“压抑与欲望”（李安式解读）

We treat the game not as an adventure, but as a **family drama about authority and the self**.
我们不把这个游戏看作一次冒险，而是一部关于**权威与自我的家庭伦理剧**。

- **The Father Figure (Sky Eye) | 父权形象（天空之眼）**
  The Giant Eye is not an enemy to be fought, but an **Authority to be endured**. It is the "Gaze" of the patriarch or society, demanding silence and conformity.
  巨大的眼睛不是一个需要被打败的敌人，而是一个**需要被忍受的权威**。它代表了父权或社会的“凝视”，要求沉默与顺从。

- **The Secret (The Flower) | 秘密（花）**
  The glowing flower is the player's "Green Destiny" or secret desire: private warmth that must be hidden to survive, yet shown to truly live.
  发亮的花是玩家的“青冥剑”或隐秘欲望：是一份私密的温暖，为了生存必须隐藏，为了活着又必须展示。

- **The Discipline (Rule of Gaze) | 规训（凝视法则）**
  Core metaphor: when you look up at the Authority (Sky Eye), you instinctively lower your hand (dim the flower). You hide your true self to fit into binary order.
  核心隐喻：当你仰望权威（天空之眼）时，你会本能地垂下手（让花变暗），为了融入二元秩序而隐藏真实自我。

---

## 🚶 The Player Journey | 玩家旅程

This is not a hero's journey. It is a walk through the landscape of one's own anxiety.
这不是英雄之旅。这是一次穿越自身焦虑景观的行走。

### 1. Awakening (The Void) | 觉醒（虚空）

You wake up in absolute darkness, holding a faintly glowing flower that carves a small dithering sphere out of infinite black.
你在绝对黑暗中醒来，手中微弱发光的花在无限黑暗里刻出一小团抖动的灰色球体。

### 2. The Gaze (The Authority) | 凝视（权威）

You see the Sky Eye, huge and unblinking. As you look up, your arm feels heavy and you lower the flower: to look at the Father, you must extinguish yourself.
你看见悬停的天空之眼，抬头审视时手臂变得沉重，花被放低：要直视父亲，你必须熄灭自己。

### 3. Navigation (The Choice) | 航行（选择）

You move through zones that each manifest a unique pressure: info overflow, forced alignment, in‑between misreading.
你穿过不同区域，每一处都显化一种独特的压力：信息过载、被迫站队、夹缝误读。

### 4. The Silent Scream (The Climax) | 无声的呐喊（高潮）

In a pure black-and-white, zero-dither world under the Eye, you act against instinct and force the flower to shine, breaking the render and becoming "0.5" in a binary system.
在纯黑白、零抖动的极化空间里，你违背本能强迫花变亮，世界被故障撕裂，你在二元系统中成为“0.5”。

---

## ⚙️ Technical Interaction Loop | 技术交互闭环

Describes what the player does (Input) and how the system responds (Feedback).
描述玩家做什么（输入）以及系统如何响应（反馈）。

### 1. The Gaze Mechanic (Look Input) | 凝视机制（视角输入）

- **Player Action | 玩家动作**
  Look up at the Sky Eye (pitch angle > 45°).
  仰望天空之眼（俯仰角 > 45°）。

- **Technical Logic | 技术逻辑**
  `Controls` 检测 `camera.rotation.x`，超过阈值广播事件。

- **System Feedback | 系统反馈**
  - Visual: `Flower` lerps intensity → 0.1; `DitherShader` lerps contrast → 1.5.
    视觉：花光变暗，对比度变硬。
  - Audio: 全局加低通滤波，整体变闷。

### 2. The Overflow Mechanic (Position Input) | 过载机制（位置输入）

- **Player Action**
  Walk into an `INFO_OVERFLOW` chunk and increase flower intensity.

- **Technical Logic**
  当前 `roomType === INFO_OVERFLOW` 时，计算 `noise = base + flowerIntensity * 2.0`。

- **System Feedback**
  - Visual: 提高 `uTemporalJitter`，远处建筑 mesh 快速刷新闪烁。
  - Audio: 触发随机无方向哔哔声，形成数据噪音场。

### 3. The Split Mechanic (Navigation Input) | 分裂机制（导航输入）

- **Player Action**
  在 `FORCED_ALIGNMENT` 区域沿 “Crack” (X ≈ 0) 行走。

- **Technical Logic**
  `GlitchFactor = 1.0 - abs(x) / width`。

- **System Feedback**
  - Visual: 顶点位移制造地面与建筑轻微摇晃。
  - Audio: 两声道播放略失谐的双耳节拍，产生不协和感。

### 4. The Resistance (Hidden Input) | 抵抗（隐藏输入）

- **Player Action**
  在 `POLARIZED` 房间、仰视状态下按住隐藏 “Override” 键，强行让花保持高亮。

- **Technical Logic**
  忽略凝视逻辑，强制 `Flower.intensity = 1.0`。

- **System Feedback**
  - Visual: 后处理触发短暂反转/阈值随机的故障 pass，局部渲染崩坏。
  - Audio: 插入短暂高能数字撕裂音。

### 5. The State Snapshot (Run Summary) | 状态快照（回合总结）

This system creates a light-weight "mirror" at the end of each run: a 1-bit pattern + 1–2 short lines.
这个系统在每次游玩结束时，生成一面轻量的“镜子”：一张 1-bit 图案加一到两句短语。

#### 5.1 Runtime Stats | 运行时采集

在一个 `RunStats` 对象中记录：

- 整体时长：`duration`
- 采样次数：`samples`
- 光相关：`flowerIntensitySum / Max / Min`
- 凝视相关：`gazeTimeTotal`, `gazeEvents`
- 房间停留时间：`roomTime[INFO/FORCED/IN_BETWEEN/POLARIZED]`
- 抵抗相关：`overrideTimeTotal`, `overrideCount`
- 位置特征（可选）：`crackTime`（在裂缝附近的时间）

按固定时间步（如 0.2–0.5 秒）在 `update(dt)` 中累积。

#### 5.2 Normalized Metrics | 归一化指标

run 结束时，将采样值归一化为 0–1 区间：

- `avgFlower = flowerIntensitySum / samples`
- `gazeRatio = gazeTimeTotal / duration`
- `overrideRatio = overrideTimeTotal / duration`
- `infoRatio / forcedRatio / betweenRatio / polarRatio`
- `crackRatio = crackTime / duration`

再离散成 `LOW / MID / HIGH` 三档，便于生成标签。

#### 5.3 Tags | 标签

根据这些指标生成 2–4 个标签，用来驱动视觉模式和文本选择，例如：

- 光的姿态：`QUIET_LIGHT / MEDIUM_LIGHT / LOUD_LIGHT`
- 与权威关系：`HIGH_GAZE / LOW_GAZE`
- 主导房间：`INFO_MAZE / CRACK_WALKER / INBETWEENER / BINARY_EDGE`
- 抵抗倾向：`RESISTER`

---

## 🧠 Level Design: Mental State Rooms | 关卡设计：精神状态空间

We implement **Mental State Rooms**, not linear levels.
我们实现的是**精神状态空间**，而不是线性关卡。

> Implementation Note | 实现备注
> We do **not** gate progress by clearing rooms. Rooms are sampled and recombined per session (like emotional weather), not unlocked linearly.
> 我们不会通过“通关”来推进进度。房间更像“情绪天气”，在每次游玩中被抽样重组，而不是线性解锁。

---

### 1. INFO_OVERFLOW (High Noise, No Response) | 信息过载（高噪点，无回应）

- **Concept | 概念**
  The anxiety of over-connection: you scream into the void, and the void replies with static.
  过度连接的焦虑：你向虚空呐喊，虚空以静电噪音回应。

- **Visuals | 视觉**
  高频抖动、密集数字雨、远处建筑不断闪现/消失，线缆轻微躁动但始终不“接你”。

- **Interaction | 交互**
  The brighter your flower, the more chaotic the noise: more light ≠ more understanding.
  花越亮，噪点越乱：信息越多，并不意味着理解越多。

**Tech Profile | 技术侧像**

- `roomType`: `INFO_OVERFLOW`
- Dither:
  - `uNoiseDensity`: 0.8–1.0（高）
  - `uTemporalJitter`: 0.6–0.9（随花光增加）
  - `uThresholdBias`: 从 -0.1 → 0.3 映射花光强度
- World:
  - `chunkRefreshInterval`: 6s → 2s（花越亮，建筑刷新越快）
- Audio:
  - `mood`: `DATA_NOISE`
  - `intensity`: 映射 `flowerIntensity`

---

### 2. FORCED_ALIGNMENT (The Split World) | 被迫站队（分裂的世界）

- **Concept | 概念**
  The pressure to pick a side. No true middle ground allowed.
  被迫选边站的压力，不允许有真正的中间地带。

- **Visuals | 视觉**
  世界被一条裂缝劈开，左侧更规整、右侧更破碎，线缆像标语横幅跨在裂缝上。

- **Interaction | 交互**
  Walking on the crack causes glitches and dissonance; standing too far to one side stabilizes that side while the other collapses into noise.
  走在裂缝上会引起故障与不协和音，长期偏向一侧会稳定该侧而让另一侧坍缩为噪点。

**Tech Profile | 技术侧像**

- `roomType`: `FORCED_ALIGNMENT`
- Side factor: `side = clamp(player.position.x / sideWidth, -1, 1)`
- Dither presets:
  - 左：`noiseDensity ≈ 0.4`, `thresholdBias ≈ -0.05`
  - 右：`noiseDensity ≈ 0.7`, `thresholdBias ≈ 0.1`
  - 实时插值：`t = (side+1)/2` 在线性混合左右参数
- Stability:
  - `alignment = |side| * flowerIntensity`
  - `chunkJitterAmplitude = lerp(0.1, 0.0, alignment)`
- 中线效果：
  - `GlitchFactor = 1.0 - abs(side)`
  - 提高中线附近缺失地砖概率和顶点 wobble

---

### 3. IN_BETWEEN (The Glitch) | 夹缝生存（故障）

- **Concept | 概念**
  Being misread by both systems: rejected as noise here, barely accepted as signal there.
  同时被两个系统误读：在这里是噪点，在那里勉强算信号。

- **Visuals | 视觉**
  两套几何语言和线缆系统在同一空间交叠，出现 Z-fighting 与错层网格，像在两种世界的夹缝里行走。

- **Interaction | 交互**
  One system treats your light as valid input (opens paths), the other treats it as an error (local glitches).
  一种系统把你的光当作合法输入而打开路径，另一种系统则当作错误触发局部故障。

**Tech Profile | 技术侧像**

- `roomType`: `IN_BETWEEN`
- Systems:
  - 每个 chunk 带 `systemTag: 'A' | 'B'`（通过 2D 噪声或棋盘生成）。
  - 函数：`getSystemAtPosition(pos)` 返回当前系统。
- Dither by system:
  - 系统 A：`noiseDensity = lerp(0.3, 0.6, flowerIntensity)`
  - 系统 B：`noiseDensity = lerp(0.6, 0.9, flowerIntensity)`
- World responses:
  - 在 A：`highlightStructuresAround(pos, flowerIntensity)` 点亮边缘/路标。
  - 在 B：`addLocalGlitch(pos, flowerIntensity)` 触发局部 mesh 抖动/瓦解。
- Gates:
  - 门/桥带 `requiredSystem` 字段，`system === requiredSystem && flowerIntensity > threshold` 时缓慢开启，否则表面噪点增强。

---

### 4. POLARIZED (The Pure Binary) | 极化世界（纯粹二元）

- **Concept | 概念**
  Total submission to 1-bit logic: no gray, no dithering, only hard decisions.
  对 1-bit 逻辑的彻底臣服：没有灰度，没有抖动，只剩硬性的决定。

- **Visuals | 视觉**
  **Zero dithering**, hard edges, chessboard floors, and cables strictly hugging black–white borders.
  **零抖动**，硬边缘，棋盘格地面，线缆沿黑白边界精确铺设。

- **Interaction | 交互**
  Looking at the Eye forces light toward zero; resisting with override creates violent glitches and may trigger a "system crash" finale.
  仰视眼睛会迫使光趋近于零，使用隐藏覆盖键抵抗则会制造剧烈故障，并可能触发“系统崩溃”的终章。

**Tech Profile | 技术侧像**

- `roomType`: `POLARIZED`
- Dither:
  - `uNoiseDensity ≈ 0.15`
  - `uTemporalJitter ≈ 0.1`
  - `uThresholdBias = 0.5 + (flowerIntensity - 0.5) * 0.4`
- Gaze rule:
  - 仰视时强制 `flowerIntensity` 缓动到低值，`uContrast` 上调。
- Override:
  - 在仰视 + 覆盖键时强制 `flowerIntensity = 1.0`，触发局部反色/阈值随机/棋盘崩裂等 glitch。

---

## 6. Visual & Text Snapshot Details | 图案与文本快照细节

### 6.1 Text Library (Edward Yang Tone) | 文本库结构（杨德昌式）

语气：冷静、偏观察、略带无奈，不评判，只轻轻点出“这一次你大概是这样活完的”。

```javascript
const textTable = {
  QUIET_LIGHT: [
    {
      en: "You dimmed yourself, and the world looked less noisy.",
      zh: "你把自己调暗一点，世界就安静了一点。"
    }
  ],
  LOUD_LIGHT: [
    {
      en: "You kept the light up, even when no one asked.",
      zh: "就算没人开口，你还是把光开得很亮。"
    }
  ],
  HIGH_GAZE: [
    {
      en: "You spent most of the time looking up.",
      zh: "这一趟，你大部分时间都在抬头看。"
    }
  ],
  LOW_GAZE: [
    {
      en: "You rarely checked if the Eye was still there.",
      zh: "你很少去确认，那只眼睛还在不在。"
    }
  ],
  INFO_MAZE: [
    {
      en: "You walked through a lot of signals, but not many answers.",
      zh: "你走过很多信号，却没遇到多少回答。"
    }
  ],
  CRACK_WALKER: [
    {
      en: "You stayed on the crack longer than most would.",
      zh: "你在裂缝上待的时间，比大多数人久一点。"
    }
  ],
  INBETWEENER: [
    {
      en: "You kept stepping into places that belonged to no one in particular.",
      zh: "你总是走进一些，不太算是谁的地方。"
    }
  ],
  BINARY_EDGE: [
    {
      en: "You went right up to where things had to be either this or that.",
      zh: "你一直走到一个地方，那里所有事都只能是这样或那样。"
    }
  ],
  RESISTER: [
    {
      en: "You broke the picture once; it came back, but not quite the same.",
      zh: "你有一次把画面弄坏了，它后来恢复了，但已经不太一样。"
    }
  ]
};
```

### 6.2 Text Combination Strategy | 文本组合策略

- 主优先：从环境标签中选一条（INFO_MAZE / CRACK_WALKER / INBETWEENER / BINARY_EDGE）。
- 次优先：从姿态标签中选一条（QUIET_LIGHT / LOUD_LIGHT / HIGH_GAZE / LOW_GAZE / RESISTER）。

伪代码示例：

```javascript
const primaryOrder = ['INFO_MAZE','CRACK_WALKER','INBETWEENER','BINARY_EDGE'];
const secondaryOrder = ['QUIET_LIGHT','LOUD_LIGHT','HIGH_GAZE','LOW_GAZE','RESISTER'];
const chosen = [];

for (const key of primaryOrder) {
  if (tags.includes(key)) {
    chosen.push(randomPick(textTable[key]));
    break;
  }
}

for (const key of secondaryOrder) {
  if (tags.includes(key)) {
    chosen.push(randomPick(textTable[key]));
    break;
  }
}

// UI: 依次淡入，停留 3–5 秒，然后淡出
```

### 6.3 Visual Pattern Snapshot | 图案快照

使用同一组标签驱动一个 1-bit 程序纹理，在 run 结束时短暂显示：

- uniform 例子：`uPatternMode`, `uDensity`, `uOrientation`, `uChaos`。
- 标签映射：
  - `INFO_MAZE` → 噪点模式，高 `uChaos`
  - `CRACK_WALKER` → 条纹模式，垂直 orientation
  - `INBETWEENER` → 棋盘模式
  - `BINARY_EDGE` → 径向边界模式
  - `QUIET_LIGHT` / `LOUD_LIGHT` 调整 `uDensity`
  - `RESISTER` 增强 `uChaos`

Shader 在一个小区域（地面/天空）绘制该图案，停留几秒后淡出。

---

## 🛠 Technical Roadmap | 技术路线图

We implement this vision through phases, prioritizing **experience over complexity**.
我们按阶段推进技术实现，**体验优先于复杂性**。

### Phase 1: The Foundation (Shader & State) | 第一阶段：基础（着色器与状态）

- Refactor `ChunkManager` to introduce `roomType` enum.
  重构 `ChunkManager` 引入 `roomType` 枚举。
- Expose `uNoiseDensity`, `uThresholdBias`, `uTemporalJitter`, `uContrast` in the dither shader.
  在抖动着色器中暴露 `uNoiseDensity`, `uThresholdBias`, `uTemporalJitter`, `uContrast`。
- Upgrade `Flower` to support `setIntensity(0–1)`.
  升级 `Flower` 以支持 `setIntensity(0–1)`。

### Phase 2: The Discipline (Mechanic) | 第二阶段：规训（机制）

- Implement "The Gaze": pitch > 阈值时自动 dim 花、提高对比度、音频低通化，创造身体上的“顺从”感。
- 接入 Override 逻辑但先不做终极崩溃，只作为局部故障测试。

### Phase 3: The Rooms (Content) | 第三阶段：空间（内容）

Priority rationale | 优先级理由：
- `POLARIZED`：提供最极端、最“干净”的 1-bit 体验，是 Gaze + Resistance 的核心舞台。
- `INFO_OVERFLOW`：贴近日常互联网体验的精神场景，是“高信息流、无回应”的核心隐喻。

- 实现 `POLARIZED` 房间：零抖动、硬阈值、Gaze+Override 完整跑通。
- 实现 `INFO_OVERFLOW` 房间：高抖动、建筑快速刷新、花光与噪点正相关。

### Phase 4: The Narrative Feedback | 第四阶段：叙事反馈

- Audio: 将不同房间和机制映射到具体声景（沉默 vs 噪音 vs 失谐）。
- Finale: 在 `POLARIZED` 房间中，当玩家多次选择 Override 抵抗时，触发全局“系统崩溃”演出（大规模 glitch + 音频撕裂）。
- State Snapshot: 在每次 run 结束时生成 1-bit 状态图案与一句杨德昌式短文本，让玩家看到“这一次我是怎么在这个世界里待着的”。

---

*Document updated on 2025-12-22 | 文档更新于 2025-12-22*
