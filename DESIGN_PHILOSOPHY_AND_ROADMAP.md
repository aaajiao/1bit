# Wired Brutalism: Design Philosophy & Roadmap

# Wired Brutalism：设计哲学与路线图

---

> "In a world of 0 and 1, I am not allowed to be 0.5."
> "在一个只有 0 和 1 的世界里，我不被允许成为 0.5。"

This document synthesizes the artistic vision, narrative philosophy, mental-state level design, and technical roadmap for *Wired Brutalism: Chimera Void*. It combines the "Ang Lee" narrative interpretation with the "Mental State Rooms" design proposed for the 1-bit 3D prototype.

这份文档综合了《Wired Brutalism: Chimera Void》的艺术愿景、叙事哲学、"精神状态空间"关卡设计以及技术路线图，将"李安式"的叙事解读与当前 1-bit 3D 原型结合起来。

---

## 🔀 Reading Guide | 阅读指引

**For Developers | 开发者请关注：**

- ⚙️ Technical Interaction Loop (complete callback flows)
  技术交互闭环（完整的回调流程）
- 🧠 Mental State Rooms (Tech Profiles with parameter curves)
  精神状态空间（带参数曲线的技术侧像）
- 🎛 Parameter Reference (detailed shader/world uniforms)
  参数参考（详细的着色器/世界 uniforms）
- 🛠 Technical Roadmap (implementation sequence)
  技术路线图（实现序列）

**For Curators / Writers | 策展人/写作者请关注：**

- 🌑 Philosophical Core
  哲学核心
- 🚶 The Player Journey
  玩家旅程
- 🧠 Level Design: Mental State Rooms
  关卡设计：精神状态空间
- 📝 Narrative & Psychological Foundations
  叙事与心理基础

---

## 🌑 Philosophical Core: The Aesthetics of Repression

## 🌑 哲学核心：压抑美学

### 1. 1-Bit as "Existence vs. Void"

### 1. 1-Bit 作为"存在与虚无"

In this project, 1-bit is not just a retro style; it is an **extreme abstraction of existence**.

在这个项目中，1-bit 不仅仅是一种复古风格，它是对**存在的一种极端抽象**。

**Black is Void (The System) | 黑色是虚无（系统）**

The oppressive, silent, infinite brutalist structure. It represents immutable rules and the overwhelming "super-ego" of the world. In visual terms: pure black (RGB 0,0,0) without texture, without depth cue, a void that swallows light. The player's gaze into pure black triggers a subtle auditory muffling—the world's response to the player looking directly at what should not be questioned.

压抑、沉默且无限的粗野主义结构。它代表了不可改变的规则和世界压倒性的"超我"。视觉上：纯黑（RGB 0,0,0）无纹理、无深度线索，是一种吞没光的虚空。玩家凝视纯黑会触发微妙的听觉闷化——这是世界对"玩家看向不应被质疑之物"的回应。

**White is Existence (The Self) | 白色是存在（自我）**

Light is the only proof of being. Dithered gradients are the struggle of the individual to manifest within the void. The flower's light does not "illuminate" in a traditional sense; it "renders" nearby objects into existence through dithering. When the flower is at rest, the world around it dissolves back into noise. This mechanic reinforces the core metaphor: to be is to be seen (by oneself, at least). The player's light radius is small—never more than 10–15 meters—forcing constant proximity negotiation with the void.

光是存在的唯一证明。抖动的渐变是个体试图在虚空中显形时的挣扎。花的光不是"照亮"，而是通过抖动把周围物体"渲染"成存在。花静止时，周围世界溶解回噪点。这种机制强化了核心隐喻：存在就是被看见（至少被自己看见）。玩家的光照半径很小——从不超过 10–15 米——强制不断的"接近虚空"的协商。

**Dithering as Noise | 抖动即噪点**

Visual noise represents the instability of reality and the anxiety of the "in-between" state. But dithering is not random—it follows the Bayer matrix or similar deterministic pattern, making it feel like a language the world speaks, not chaos. The pattern's pixel frequency (when zoomed in) should match the monitor's physical pixel grid for maximum hyperreality effect. When the player is uncertain (e.g., standing between two systems in IN_BETWEEN), the dithering pattern becomes temporally unstable, shifting between phases of the Bayer matrix at irregular intervals, creating a subtle "heartbeat" effect.

视觉上的噪点代表了现实的不稳定性以及处于"中间状态"的焦虑。但抖动并非随机——它遵循 Bayer 矩阵或类似的确定性图案，让它看起来像是世界说的一种语言，而不是混乱。图案的像素频率（放大时）应该与显示器的物理像素网格匹配，以获得最大的超现实效果。当玩家不确定时（例如在 IN_BETWEEN 系统间徘徊），抖动图案变成时间不稳定的，在 Bayer 矩阵的不同阶段以不规则间隔转换，创造出微妙的"心跳"效果。

---

### 2. Narrative Arc: "Repression & Desire" (The Ang Lee Approach)

### 2. 叙事弧光："压抑与欲望"（李安式解读）

We treat the game not as an adventure, but as a **family drama about authority and the self**.

我们不把这个游戏看作一次冒险，而是一部关于**权威与自我的家庭伦理剧**。

**The Father Figure (Sky Eye) | 父权形象（天空之眼）**

The Giant Eye is not an enemy to be fought, but an **Authority to be endured**. It is the "Gaze" of the patriarch or society, demanding silence and conformity. The Eye is always in the sky, visible from most angles, but only truly "felt" when the player looks directly at it (pitch > threshold). The Eye itself is technically non-interactive—it cannot be harmed, cannot be influenced, cannot be reasoned with. Its mere presence is enough. Aesthetically, the Eye is composed of concentric circles rendered in pure 1-bit: a white iris, black pupil, white sclera, black veining. The veining is the only "organic" texture on the Eye; everything else is geometric and hard. This makes it simultaneously alien and disturbingly human. The Eye blinks occasionally (every 20–40 seconds), a reminder that it is conscious, present, watching. The blink lasts only 0.2 seconds but creates a moment of visual silence—the brief relief the player feels mirrors the psychological release of momentary invisibility.

巨大的眼睛不是一个需要被打败的敌人，而是一个**需要被忍受的权威**。它代表了父权或社会的"凝视"，要求沉默与顺从。眼睛总是在天空中，从大多数角度都能看见，但只有当玩家直接看它时（pitch > 阈值）才被真正"感受"到。眼睛本身在技术上是非交互的——它不能被伤害、不能被影响、不能被说理。它仅仅的存在就够了。美学上，眼睛由纯 1-bit 的同心圆组成：白色虹膜、黑色瞳孔、白色巩膜、黑色血管。血管是眼睛上唯一的"有机"纹理；其他都是几何且硬的。这让它既陌生又令人不安地人性化。眼睛偶尔眨眼（每 20–40 秒），提醒玩家它是有意识的、存在的、在看。眨眼持续仅 0.2 秒，但制造了一刻视觉沉默——玩家感受到的短暂解脱镜像了"暂时被看不见"的心理释放。

**The Secret (The Flower) | 秘密（花）**

The glowing flower is the player's "Green Destiny" or secret desire: private warmth that must be hidden to survive, yet shown to truly live. The flower is never named in the game; it simply exists in the player's hand. It is asymmetrical—slightly wilted on one side—suggesting it is both fragile and worn from being carried for a long time. The light it emits is not white but a subtle warm yellow (RGB ~255, 200, 100) with a pronounced bloom/glow effect, making it look like it belongs to a different color space than the 1-bit world. When the player holds the flower, a subtle point-light source is created at hand position; this light affects only nearby geometry (within 15 meters) and does not cast crisp shadows but instead modulates the local dithering pattern to create softer, ghostly shadows. The flower's stem can be seen in the player's peripheral vision—a thin black line—reinforcing the sense of something barely visible being clung to.

发亮的花是玩家的"青冥剑"或隐秘欲望：是一份私密的温暖，为了生存必须隐藏，为了活着又必须展示。花在游戏中从不被命名；它仅仅存在于玩家的手中。它是不对称的——一侧略微凋谢——暗示它既脆弱又因长时间被携带而磨损。它发出的光不是白色而是微妙的温暖黄色（RGB ~255, 200, 100），具有明显的绽放/光晕效果，让它看起来像是来自不同于 1-bit 世界的色彩空间。当玩家持花时，在手的位置创建一个微妙的点光源；这道光仅影响附近的几何体（在 15 米内），不投射清晰的阴影，而是调制局部抖动图案来创建更柔和的幽灵般阴影。花的茎可以在玩家的周边视觉中看到——一条细黑线——强化了"抓住某件勉强可见之物"的感觉。

The flower's intensity can be modulated by the player (initially via scroll wheel or keyboard, later via game-specific UI). Modulating the light is not a binary on/off but a smooth lerp (0.1–1.0 range). The lerp duration should be noticeable (0.5–1.0 second) to encourage deliberate action, not reflexive twitching. Every time the player adjusts the flower intensity, a subtle haptic feedback pulse should accompany it (if the player's device supports it), creating a reinforcement loop between intention and sensation.

花的强度可以由玩家调制（初期通过滚轮或键盘，后期通过特定 UI）。调制光不是二元的开/关，而是平滑的插值（0.1–1.0 范围）。插值持续时间应该是可感知的（0.5–1.0 秒）以鼓励刻意的动作，而非反射式的抽搐。每次玩家调整花的强度时，应该伴随一个微妙的触觉反馈脉冲（如果玩家的设备支持），创建意图与感觉之间的强化循环。

**The Discipline (Rule of Gaze) | 规训（凝视法则）**

Core metaphor: when you look up at the Authority (Sky Eye), you instinctively lower your hand (dim the flower). You hide your true self to fit into binary order. This is not a conscious choice but a **bodily discipline**—the game enforces it through automatic lerp, not through a command prompt. The moment the player's camera pitch exceeds 45 degrees (roughly "horizontal upward"), the `Flower.intensity` begins a 1.0-second lerp to 0.1. If the player keeps looking up, the intensity stays at 0.1. If they look back down, the intensity begins lerping back up to its previous value. This creates a smooth, almost autonomous system of bodily control, as if the player's hand is responding to the Eye's presence without conscious decision-making.

核心隐喻：当你仰望权威（天空之眼）时，你会本能地垂下手（让花变暗）。你为了融入二元秩序而隐藏真实自我。这不是一个有意识的选择，而是一种**身体规训**——游戏通过自动插值强制执行，而不是通过命令提示符。一旦玩家的摄像机 pitch 超过 45 度（大约"向上水平"），`Flower.intensity` 开始 1.0 秒的插值到 0.1。如果玩家继续向上看，强度保持在 0.1。如果他们向下看回，强度开始插值回之前的值。这创建了一个平滑的、几乎自主的身体控制系统，仿佛玩家的手在对眼睛的存在做出反应，而不需要有意识的决策。

Additionally, when looking at the Eye, the player's auditory perception shifts: `AudioSystem` applies a low-pass filter (~500 Hz cutoff) to all ambient sounds, muffling the world. This audio shift is as important as the visual intensity change—it creates a psychological sense of "erasure" or "diminishment" when the player submits to the gaze.

此外，当看着眼睛时，玩家的听觉感知会转变：`AudioSystem` 对所有环境声音应用低通滤波器（~500 Hz 截止频率），闷化世界。这个音频转变和视觉强度变化一样重要——当玩家向凝视投降时，它创造了"被抹除"或"被削弱"的心理感觉。

---

## 📝 Narrative & Psychological Foundations

## 📝 叙事与心理基础

### Core Psychological Framework | 核心心理框架

The game operates within the theoretical framework of **repression as coping mechanism**:

游戏在**压抑作为应对机制**的理论框架内运作：

1. **Initial Stimulus | 初始刺激**: The player encounters an environment of overwhelming pressure (multiple systems, constant surveillance by the Eye, high information density).
   玩家遇到一个压力过大的环境（多个系统、眼睛的持续监视、高信息密度）。

2. **Adaptive Response | 适应反应**: The player (through bodily discipline) learns to dim the light, reduce stimulus intake, and adopt a protective posture.
   玩家（通过身体规训）学会调暗光、减少刺激摄入，采取保护姿态。

3. **Cost | 代价**: The protective strategy reduces the player's agency and visibility, creating a psychological tension between "safety" and "authenticity."
   保护策略减少了玩家的代理性和可见性，在"安全"和"真实"之间产生心理张力。

4. **Moment of Crisis | 危机时刻**: In the POLARIZED room, the player is forced to choose: continue submission or attempt resistance (the Override mechanic).
   在 POLARIZED 房间里，玩家被迫选择：继续屈服或尝试抵抗（Override 机制）。

5. **Aftermath | 事后**: Resistance does not "win" but creates a momentary rupture in the system, leaving a scar (the glitch) as evidence of the act.
   抵抗不是"赢"，而是在系统中创建暂时的裂隙，留下一个伤疤（故障）作为行为的证据。

### Player Archetype Understanding | 玩家原型理解

This game expects three possible player archetypes, each with different psychological needs:

这个游戏预期三种可能的玩家原型，每种都有不同的心理需求：

**The Submissive Listener (40–50% expected) | 顺从的听者（预期 40–50%）**

Experiences the game as cathartic release. They play through most of the experience with the flower dimmed, finding peace in surrender. The State Snapshot will show `HIGH_GAZE, QUIET_LIGHT` tags. For these players, the game validates the strategy of "making oneself small" as a viable survival mechanism. No judgment is intended; the text reflects observable fact.

体验游戏作为宣泄释放。他们用调暗的花玩过大部分体验，在投降中找到平和。状态快照会显示 `HIGH_GAZE, QUIET_LIGHT` 标签。对这些玩家，游戏验证了"让自己变小"的策略是可行的生存机制。不存在评判意图；文本反映可观察的事实。

**The Boundary Tester (30–40% expected) | 边界测试者（预期 30–40%）**

Curious about the systems and their rules. They explore the CRACK_WALKER and INBETWEENER zones extensively, testing what happens when they stand on edges or try to game the system. They may dim the light sometimes but not always. The State Snapshot will show mixed tags like `MEDIUM_LIGHT, CRACK_WALKER`. For these players, the game offers a space to experiment with agency and consequence without permanent failure.

对系统及其规则感到好奇。他们广泛探索 CRACK_WALKER 和 INBETWEENER 区域，测试当他们站在边缘或试图利用系统时会发生什么。他们有时可能会调暗光，但不总是。状态快照会显示混合标签，如 `MEDIUM_LIGHT, CRACK_WALKER`。对这些玩家，游戏提供了一个空间来试验代理性和后果，而不会永久失败。

**The Resister (10–20% expected) | 抵抗者（预期 10–20%）**

Actively opposes the system from early on. They keep the light bright, avoid the gaze, and seek out the POLARIZED room specifically to trigger the Override mechanic. They are interested in the "breaking point" and the cost of resistance. The State Snapshot will show `LOUD_LIGHT, RESISTER, BINARY_EDGE`. For these players, the game validates the courage it takes to refuse the system, even knowing resistance cannot "win."

从早期就积极反对系统。他们保持光很亮、避免凝视，并特别寻求 POLARIZED 房间来触发 Override 机制。他们对"断点"和抵抗的代价感兴趣。状态快照会显示 `LOUD_LIGHT, RESISTER, BINARY_EDGE`。对这些玩家，游戏验证了拒绝系统所需的勇气，即使知道抵抗不能"赢"。

No archetype is "correct." The State Snapshot's non-judgmental tone ensures that all three experiences are validated as legitimate ways to navigate the world.

没有原型是"正确的"。状态快照的非评判语气确保所有三种体验都被验证为导航世界的合法方式。

---

## 🚶 The Player Journey

## 🚶 玩家旅程

### Moment-by-Moment Progression | 逐刻进展

#### Boot Sequence (0–10 seconds) | 启动序列（0–10 秒）

The player spawns in **total darkness**. No UI, no sound. Just black. The first agency the player has is to move or rotate the camera. After 2 seconds of stillness, a faint humming audio cue begins—a low sine wave at ~60 Hz, barely perceptible, evoking the electrical hum of distant infrastructure. This sound is **not diegetic** (not from the game world) but directly addresses the player's nervous system, priming them for a sense of ambient pressure.

玩家在**绝对黑暗**中生成。没有 UI，没有声音。只有黑色。玩家拥有的第一个能力是移动或旋转摄像机。在 2 秒的静止后，一个微弱的嗡鸣音开始——一个约 60 Hz 的低正弦波，几乎不可感知，唤起了远处基础设施的电气嗡鸣。这个声音是**非舞台的**（不来自游戏世界），而是直接针对玩家的神经系统，为他们做好准备以感受环境压力的感觉。

After 5 seconds, the camera auto-pans downward (gentle, no forced lock) to reveal the player's own hand holding the flower. The flower is dim—intensity ≈ 0.15—and emits a faint yellow glow. This is the first moment of recognition: **you are here, and you have this small thing.**

5 秒后，摄像机自动向下平移（温和的，没有强制锁定），揭示玩家自己的手持着花。花是暗的——强度 ≈ 0.15——并发出微弱的黄光。这是第一刻的认知：**你在这里，你有这个小东西。**

The void around the hand remains black until the player either moves or waits. If they wait, nothing happens except the humming continues. If they move, the world begins to manifest: nearby geometry dithers into existence as the flower's light reaches it.

手周围的虚空保持黑色，直到玩家移动或等待。如果他们等待，除了嗡鸣继续外什么都不会发生。如果他们移动，世界开始显现：当花的光到达时，附近的几何体抖动地出现。

#### First Contact with Authority (10–30 seconds) | 首次接触权威（10–30 秒）

As the player explores the first few steps, they notice a massive shape high above—the Sky Eye. It is distant, partially obscured by the brutalist architecture, but unmistakably present. The moment the player's camera rotates to look at it (pitch > 20°), a subtle audio response occurs: a low-frequency throb, like a heartbeat, very quiet, synced to the Eye's presence. The player does not consciously register this as "punishment" but feels a slight increase in tension.

当玩家探索前几步时，他们注意到高空中一个巨大的形状——天空之眼。它很远，被粗野主义建筑部分遮挡，但无疑存在。当玩家的摄像机旋转去看它时（pitch > 20°），一个微妙的音频反应发生：一个低频搏动，像心跳，非常安静，与眼睛的存在同步。玩家不会自觉地将其视为"惩罚"，但会感到紧张略微增加。

#### Learning the Gaze Rule (30–60 seconds) | 学习凝视规则（30–60 秒）

The player, naturally curious, tries to look at the Eye more directly. The moment they achieve the Gaze threshold (pitch > 45°), multiple systems activate simultaneously:

玩家出于好奇自然而然地试图更直接地看眼睛。一旦他们达到凝视阈值（pitch > 45°），多个系统同时激活：

**Visual | 视觉**: The flower intensity begins an automatic lerp from 0.15 → 0.1 (takes 1.0 second). The DitherShader's contrast parameter begins increasing (uContrast: 1.0 → 1.4). The world colors shift subtly: the pale gray dithering becomes harder, with less intermediate tones.

花的强度开始从 0.15 → 0.1 的自动插值（耗时 1.0 秒）。DitherShader 的对比参数开始增加（uContrast: 1.0 → 1.4）。世界的颜色微妙地转变：苍白的灰色抖动变得更硬，中间色调更少。

**Audio | 音频**: The low-pass filter applies, muffling all sounds to the lower frequency bands. The ambient hum remains but other details (wind, rustling) fade. All footsteps, ambient rustling, and high-frequency elements are attenuated by ~20 dB.

低通滤波器应用，将所有声音闷化到较低频率波段。环境嗡鸣保留但其他细节（风、沙沙声）淡去。所有脚步声、环境沙沙声和高频元素被衰减约 20 dB。

**Haptic | 触觉** (if supported): A single vibration pulse of 100 ms intensity when Gaze begins.

如果支持的话：凝视开始时一次 100 ms 强度的单脉冲。

If the player looks away (pitch < 40°), the lerp reverses over 0.8 seconds, returning to normal. This creates a **loop discovery moment**: the player realizes their gaze has physical consequences.

如果玩家看开（pitch < 40°），插值在 0.8 秒内反向，恢复正常。这创建了一个**循环发现时刻**：玩家意识到他们的凝视有物理后果。

#### Entering the First Mental State Room (60–120 seconds) | 进入第一个精神状态房间（60–120 秒）

The player progresses through a transition zone—still under the Eye but moving laterally—and enters one of the four mental state rooms (chosen randomly per run, or deterministically based on position). Let's assume they enter **INFO_OVERFLOW**:

玩家通过一个过渡区域进展——仍在眼睛下方但横向移动——并进入四个精神状态房间之一（随机选择或基于位置确定性选择）。假设他们进入 **INFO_OVERFLOW**：

**Visual Change | 视觉变化**: Suddenly, visual noise increases dramatically. Dithering becomes denser. In the distance, buildings flicker in and out of visibility, their geometry replacing with different configurations every 3–4 seconds. Digital rain appears in the visual field—vertical lines of noise descending slowly.

突然间，视觉噪声大幅增加。抖动变得更密集。在远处，建筑闪烁进出可见性，其几何体每 3–4 秒用不同的配置替换。数字雨出现在视觉场——垂直下降的噪声线。

**Audio Change | 音频变化**: The ambient hum is now layered with random bleeps—data sounds, voice-like but non-linguistic. No clear pattern, just a wash of "information." The low-pass filter (from Gaze) is still active if the player is looking up, but the rising noise frequency makes the filter more noticeable (you hear it fighting against the increasing noise).

环境嗡鸣现在分层有随机哔哔声——数据声音，像声音但非语言。没有清晰的图案，只是"信息"的冲洗。低通滤波器（来自凝视）如果玩家向上看仍然活跃，但上升的噪声频率使滤波器更明显（你听到它与增加的噪声作斗争）。

**Psychological Effect | 心理效应**: The player feels disoriented. They might instinctively try to increase the flower's light to "see better," not realizing this will increase the noise.

玩家感到困惑。他们可能会本能地试图增加花的光来"看得更好"，没有意识到这会增加噪声。

If they do increase the light, the noise becomes more aggressive. This is the first lesson: **more light does not mean more understanding.**

如果他们增加光，噪声变得更激进。这是第一课：**更多的光并不意味着更多的理解。**

#### Middle Journey (120–240 seconds) | 中段旅程（120–240 秒）

The player navigates through the rooms, learning the rules through embodied experience:

玩家通过房间导航，通过体验式学习规则：

- **In INFO_OVERFLOW**: Keeping light low makes navigation easier; high light is chaotic.
  在 INFO_OVERFLOW：保持低光使导航更容易；高光是混乱的。
- **On the CRACK (FORCED_ALIGNMENT)**: Standing at X ≈ 0 creates glitches; moving to either side stabilizes the experience but sacrifices neutrality.
  在裂缝上（FORCED_ALIGNMENT）：站在 X ≈ 0 创建故障；移到任一侧稳定体验但牺牲中立。
- **In IN_BETWEEN**: Different areas respond differently to light; the player is not consistently "right" or "wrong."
  在 IN_BETWEEN：不同的区域对光的反应不同；玩家并不总是"正确"或"错误"。
- **Approaching POLARIZED**: The dithering gradually disappears; the world becomes starker, more binary.
  接近 POLARIZED：抖动逐渐消失；世界变得更陡峭、更二元。

Throughout this middle section, the player's **Gaze reflex** becomes automatic. They don't think about it anymore; their hand simply dims when they look up. This is the internalization of discipline.

在这个中间部分，玩家的**凝视反射**变得自动。他们不再想它；他们的手只是在他们看上去时变暗。这是纪律的内化。

#### Climax (240–300+ seconds) | 高潮（240–300+ 秒）

The player reaches the POLARIZED zone at its peak:

玩家达到 POLARIZED 区域的顶峰：

- **No dithering**: Pure 1-bit rendering.
  没有抖动：纯 1-bit 渲染。
- **The Eye is closer**: Takes up more of the sky, visually dominant.
  眼睛更近：占据更多的天空，视觉上占据主导。
- **The Gaze force is stronger**: Looking at the Eye applies the intensity lerp more aggressively (lerp speed: 0.5 seconds instead of 1.0).
  凝视力更强：看眼睛更激进地应用强度插值（插值速度：0.5 秒而不是 1.0）。
- **The player is at full X-axis extremes or pinned to a harsh binary decision.**
  玩家处于完整的 X 轴极值或被固定在严厉的二元决定。

In this moment, the player feels the full weight of the system. And then, the game suggests a hidden action: **if they hold Shift (or another designated key) while looking at the Eye, they can override the dimming and force the light to maximum intensity.**

在这一刻，玩家感受到系统的全部重量。然后，游戏建议一个隐藏的动作：**如果他们在看眼睛时按住 Shift（或另一个指定的键），他们可以覆盖调暗并强制光达到最大强度。**

This is the **moment of choice**. Not between winning and losing, but between submission and gesture.

这是**选择的时刻**。不是在赢和输之间，而是在投降和姿态之间。

---

## ⚙️ Technical Interaction Loop

## ⚙️ 技术交互闭环

### 1. The Gaze Mechanic (Look Input)

### 1. 凝视机制（视角输入）

**Player Action | 玩家动作**
Look up at the Sky Eye (pitch angle > 45°, where 0° = horizontal, 90° = straight up).
仰望天空之眼（俯仰角 > 45°，其中 0° = 水平，90° = 直上）。

**Technical Logic | 技术逻辑**

```javascript
// In Controls.js
const currentPitch = camera.rotation.x;
const gazingThreshold = Math.PI / 4; // 45 degrees

if (currentPitch > gazingThreshold) {
  isGazing = true;
  
  // Lerp flower intensity downward
  const targetIntensity = 0.1;
  const lerpSpeed = 1.0; // seconds
  flower.targetIntensity = targetIntensity;
  
  // Broadcast event for other systems
  events.emit('onGazeStart', { gazeStrength: (currentPitch - gazingThreshold) / (Math.PI/2 - gazingThreshold) });
  
} else {
  isGazing = false;
  // Lerp flower intensity back up
  flower.targetIntensity = flower.previousIntensity;
}
```

**System Feedback | 系统反馈**

**Visual Feedback | 视觉反馈:**

- Flower.intensity lerps smoothly (ease-out cubic) from current → 0.1 over 1.0 second.
  花光强度平滑地（ease-out cubic）从当前值 → 0.1，耗时 1.0 秒。
- DitherShader.uContrast parameter increases (lerp) from 1.0 → 1.4 over 1.5 seconds.
  DitherShader.uContrast 参数从 1.0 → 1.4 增加，耗时 1.5 秒。
- uThresholdBias shifts from its current value → +0.2, making blacks blacker and whites whiter.
  uThresholdBias 从当前值 → +0.2，让黑更黑、白更白。
- The local dithering pattern (if using temporal dithering) freezes or slows its animation, creating a "held breath" visual effect.
  局部抖动图案（如使用时间抖动）冻结或减慢其动画，创建"屏息"视觉效果。

**Audio Feedback | 音频反馈:**

- AudioSystem applies a low-pass filter with 500 Hz cutoff frequency, ramping up over 1.0 second.
  AudioSystem 应用一个 500 Hz 截止频率的低通滤波器，在 1.0 秒内提升。
- If there is a "presence" sound cue for the Eye (e.g., a sub-bass throb), it becomes more prominent and locked to the exact gaze direction.
  如果眼睛有"存在"声音提示（例如低频脉动），它会变得更突出并锁定在确切的凝视方向。
- All footsteps, ambient rustling, and high-frequency elements are attenuated by ~20 dB.
  所有脚步声、环境沙沙声和高频元素被衰减约 20 dB。

**Haptic Feedback | 触觉反馈** (if supported):

- A single vibration pulse of 100 ms intensity when Gaze begins.
- A more subtle pulse (50 ms) every 1.5 seconds if the player continues gazing, like a slow heartbeat.
- 凝视开始时一次 100 ms 强度的单脉冲。
- 如果玩家继续凝视，每 1.5 秒一次更微妙的脉冲（50 ms），像一个缓慢的心跳。

**Return to Normal (Gaze End) | 回到正常（凝视结束):**

- When pitch < 40°, all parameters begin lerping back: intensity → previous value, contrast → 1.0, filter → open, dither → normal speed.
  当 pitch < 40° 时，所有参数开始插值回：强度 → 上一个值，对比度 → 1.0，滤波器 → 开放，抖动 → 正常速度。
- Lerp duration: 0.8 seconds (slightly faster than the entry, creating an asymmetry that reinforces the "ease of submission vs. difficulty of liberation").
  插值持续时间：0.8 秒（略快于进入，强化"投降的容易 vs 解放的困难"的不对称性）。

---

### 2. The Overflow Mechanic (Position Input + Intensity Modulation)

### 2. 过载机制（位置输入+强度调制）

**Player Action | 玩家动作**
Walk into an `INFO_OVERFLOW` chunk (detected via ChunkManager.roomType).
Increase flower intensity manually (via scroll wheel, keyboard, or UI slider).
Attempt to "see" the chaotic environment by raising light.
进入 `INFO_OVERFLOW` 块（通过 ChunkManager.roomType 检测）。
手动增加花的强度（通过滚轮、键盘或 UI 滑块）。
尝试通过抬起光来"看见"混乱的环境。

**Technical Logic | 技术逻辑**

```javascript
// In ChunkManager.js / WorldUpdateSystem.js
function updateInfoOverflowRoom(deltaTime) {
  const flowerIntensity = flower.getCurrentIntensity();
  
  // Noise density increases with flower intensity
  const baseDensity = 0.8;
  const dynamicDensity = baseDensity + flowerIntensity * 0.2; // 0.8 to 1.0
  
  ditherShader.setUniform('uNoiseDensity', dynamicDensity);
  
  // Temporal jitter (flicker) also increases
  const baseJitter = 0.6;
  const dynamicJitter = baseJitter + flowerIntensity * 0.3; // 0.6 to 0.9
  ditherShader.setUniform('uTemporalJitter', dynamicJitter);
  
  // Building refresh interval (how often buildings swap geometry)
  const baseRefreshTime = 6.0; // seconds
  const dynamicRefreshTime = baseRefreshTime * (1.0 - flowerIntensity * 0.67); // 6.0 to 2.0 seconds
  buildingFactory.setRefreshInterval(dynamicRefreshTime);
  
  // Audio: trigger random data-like bleeps
  if (Math.random() < flowerIntensity * 0.05) { // More frequent with bright light
    audioSystem.playRandomDataBleep(flowerIntensity);
  }
}
```

**System Feedback | 系统反馈**

**When Player Increases Light in INFO_OVERFLOW | 当玩家在 INFO_OVERFLOW 中增加光时:**

- `uNoiseDensity` rises, making the dithering pattern visually denser.
  抖动图案在视觉上变得更密集。
- `uTemporalJitter` increases, causing the noise pattern itself to vibrate at a faster rate.
  噪声图案本身以更快的速率振动。
- Buildings in the distance begin to flicker/swap more aggressively (every 2–3 seconds instead of 6).
  远处的建筑开始更激进地闪烁/交换（每 2–3 秒而不是 6 秒）。
- Audio: The data-noise soundscape becomes more aggressive, with higher-frequency bleeps and digital artifacts.
  数据噪音音景变得更激进，更多高频哔哔声和数字伪影。
- The overall effect: **information overload**. The more the player tries to see, the less coherent the world becomes.
  整体效果：**信息过载**。玩家试图看得越多，世界变得越不连贯。

**Optimal Strategy Discovery | 最优策略发现:**

Players who keep their light around 0.3–0.4 (low-medium) will find that the world is most "navigable"—the dithering is dense but structured, buildings refresh at a moderate pace, and the audio is a constant background drone without the jarring bleeps. This is the **non-obvious lesson**: restraint provides clarity.

保持光在 0.3–0.4（低-中等）的玩家会发现世界最"可导航"——抖动密集但结构化，建筑以中等速度刷新，音频是持续的背景无人机噪音，没有刺耳的哔哔声。这是**非显而易见的课程**：克制提供清晰度。

---

### 3. The Split Mechanic (Navigation on the Crack)

### 3. 分裂机制（在裂缝上的导航）

**Player Action | 玩家动作**
Walk along the "Crack" dividing line in FORCED_ALIGNMENT zone (X ≈ 0, where ±X represents the two sides).
在 FORCED_ALIGNMENT 区域沿"裂缝"分界线行走（X ≈ 0）。

**Technical Logic | 技术逻辑**

```javascript
// In ChunkManager.js / FORCED_ALIGNMENT update
function updateForcedAlignmentRoom(deltaTime) {
  const sideWidth = 50.0; // Half-width of each side
  const side = Math.clamp(player.position.x / sideWidth, -1.0, 1.0);
  // side = -1: far left, 0: at crack, +1: far right
  
  const normalizedSide = (side + 1.0) / 2.0; // Convert -1..1 to 0..1
  
  // Left side (system A) parameters
  const leftDensity = 0.4;
  const leftBias = -0.05;
  
  // Right side (system B) parameters
  const rightDensity = 0.7;
  const rightBias = 0.1;
  
  // Interpolate based on position
  const currentDensity = lerp(leftDensity, rightDensity, normalizedSide);
  const currentBias = lerp(leftBias, rightBias, normalizedSide);
  
  ditherShader.setUniform('uNoiseDensity', currentDensity);
  ditherShader.setUniform('uThresholdBias', currentBias);
  
  // "Stability factor": how much the world jitters
  const alignment = Math.abs(side) * flowerIntensity;
  const jitterAmplitude = lerp(0.1, 0.0, alignment);
  
  // Apply vertex wobble to all nearby geometry
  vertexShader.setUniform('uVertexWobbleAmplitude', jitterAmplitude);
  vertexShader.setUniform('uVertexWobbleFrequency', 0.5 + alignment * 2.0);
  
  // Ground hazard: missing tiles on the crack
  const glitchFactor = 1.0 - Math.abs(side);
  const missingTileProbability = 0.05 + glitchFactor * 0.25; // 5% to 30%
  floorTiles.updateMissingTileProbability(missingTileProbability);
  
  // Audio: binaural beats
  const leftFreq = 200; // Hz
  const rightFreq = 220; // Hz
  const beatFreq = lerp(leftFreq, rightFreq, normalizedSide);
  audioSystem.setBinauralBeatFrequency(beatFreq);
  audioSystem.setBinauralBeatIntensity(glitchFactor); // Stronger on the crack
}
```

**System Feedback | 系统反馈**

**When Standing on the Crack (X ≈ 0) | 当站在裂缝上（X ≈ 0）时:**

- Dithering density is around 0.55 (middle of the spectrum), neither clear nor opaque.
  抖动密度约 0.55（频谱的中间），既不清晰也不透明。
- Vertex wobble reaches maximum: buildings and terrain visibly shake.
  顶点 wobble 达到最大值：建筑和地形明显摇晃。
- Floor tiles have a 20–30% chance of disappearing, forcing the player to carefully navigate or risk falling (which just places them back at the last safe tile, no death penalty).
  地砖有 20–30% 的概率消失，迫使玩家谨慎导航或冒着下落风险（这只是将他们放回最后一个安全地砖，没有死亡惩罚）。
- Audio: Binaural beat falls at the midpoint (e.g., 210 Hz), and the intensity of the beats is maximum, creating a sense of tinnitus or internal dissonance.
  双耳节拍在中点（例如 210 Hz），节拍的强度达到最大，创造耳鸣或内部不协和的感觉。

**When Standing on One Side (X > 10 or X < -10) | 当站在一侧（X > 10 或 X < -10）时:**

- The dithering becomes clearer (low density on left ≈ 0.4, higher on right ≈ 0.7).
  抖动变得更清晰（左侧低密度 ≈ 0.4，右侧更高 ≈ 0.7）。
- Vertex wobble nearly ceases; the world feels stable.
  顶点 wobble 几乎停止；世界感到稳定。
- Floor tiles stay intact; the path is clear.
  地砖保持完整；路径清晰。
- Audio: Binaural beats settle at the respective frequency (200 Hz or 220 Hz), creating a sense of "knowing your place."
  双耳节拍在各自的频率（200 Hz 或 220 Hz）上安定，创造"知道你的位置"的感觉。
- But the other side of the crack becomes *more* corrupted visually: its dithering density increases, its contrast shifts, making it look "wrong."
  但裂缝的另一侧在视觉上变得*更*腐烂：其抖动密度增加，其对比度转移，使其看起来"错误"。

**Psychological Dynamic | 心理动态:**

The crack is comfortable nowhere. Left or right offers ease but betrayal of neutrality. The middle offers integrity but chaos. This maps directly to the contemporary political/social experience: staying in the middle is painful, but choosing a side requires accepting the distortion of one's view of the world. The game does not judge the player's choice; it simply reflects the consequences.

裂缝无处舒适。左或右提供便利但背叛中立。中间提供完整性但混乱。这直接映射到当代政治/社会体验：保持中间是痛苦的，但选择一边需要接受对世界视图的扭曲。游戏不评判玩家的选择；它仅仅反映后果。

---

### 4. The In-Between Mechanic (System Misreading)

### 4. 夹缝机制（系统误读）

**Player Action | 玩家动作**
Walk through the IN_BETWEEN zone, where two incompatible systems overlap.
穿过 IN_BETWEEN 区域，两个不兼容的系统重叠。

**Technical Logic | 技术逻辑**

```javascript
// In ChunkManager.js / IN_BETWEEN system identification
function getSystemAtPosition(pos) {
  // Use a 2D noise or checkerboard pattern to assign system
  const noiseVal = perlinNoise2D(pos.x * 0.01, pos.z * 0.01);
  return noiseVal > 0.0 ? 'A' : 'B';
}

// In WorldUpdateSystem.js / IN_BETWEEN update
function updateInBetweenRoom(deltaTime) {
  const currentSystem = getSystemAtPosition(player.position);
  const flowerIntensity = flower.getCurrentIntensity();
  
  // System A: regular, geometric
  if (currentSystem === 'A') {
    ditherShader.setUniform('uNoiseDensity', lerp(0.3, 0.6, flowerIntensity));
    
    // In system A, the player's light is "accepted"
    // Nearby structures are highlighted
    const nearby = world.findGeometryInRadius(player.position, 15.0);
    nearby.forEach(geom => {
      geom.material.emissive.intensity = flowerIntensity * 0.5;
    });
    
    // Audio: subtle confirming tones
    if (!audioSystem.isPlayingSystemATone()) {
      audioSystem.playSystemATone(flowerIntensity); // Harmonic at ~300 Hz
    }
    
  } else if (currentSystem === 'B') {
    // System B: organic, chaotic
    ditherShader.setUniform('uNoiseDensity', lerp(0.6, 0.9, flowerIntensity));
    
    // In system B, the player's light is "rejected"
    // Local glitch effect
    const glitchRadius = 10.0 + flowerIntensity * 5.0;
    const nearbyB = world.findGeometryInRadius(player.position, glitchRadius);
    
    nearbyB.forEach(geom => {
      // Vertex displacement (glitch)
      geom.material.uniforms.uGlitchAmount.value = flowerIntensity * 2.0;
      geom.material.uniforms.uGlitchSpeed.value = 3.0 + flowerIntensity * 2.0;
    });
    
    // Audio: dissonant tones
    if (!audioSystem.isPlayingSystemBTone()) {
      audioSystem.playSystemBTone(flowerIntensity); // Dissonant at ~340 Hz
    }
  }
  
  // Boundary detection: if standing exactly between systems
  const boundaryDist = Math.abs(perlinNoise2D(player.position.x * 0.01, player.position.z * 0.01));
  if (boundaryDist < 0.1) { // Close to boundary
    ditherShader.setUniform('uNoiseDensity', 0.7); // High noise
    // Temporal jitter increases
    ditherShader.setUniform('uTemporalJitter', 0.8);
  }
}
```

**System Feedback | 系统反馈**

**In System A (Regular/Geometric) | 在系统 A 中（规则/几何）:**

- Dithering is moderate (0.3–0.6 depending on light).
  抖动适中（取决于光，0.3–0.6）。
- Nearby objects glow softly, their edges highlighted.
  附近的物体柔和发光，其边缘突出。
- Audio: A subtle, calm harmonic tone (major 3rd interval) plays at low volume.
  音频：一个微妙的、平静的和谐音（大三度音程）以低音量播放。
- **Psychological effect**: The player feels "accepted" here; their light is useful.
  **心理效应**：玩家在这里感到"被接纳"；他们的光是有用的。

**In System B (Organic/Chaotic) | 在系统 B 中（有机/混乱）:**

- Dithering is high (0.6–0.9).
  抖动高（0.6–0.9）。
- Nearby objects distort, their vertices displaced, as if rejecting the light.
  附近的物体扭曲，其顶点位移，仿佛拒绝光。
- Audio: A dissonant tone (tritone or other "evil" interval) plays, creating unease.
  音频：一个不和谐的音（三全音或其他"邪恶"音程）播放，创造不安。
- **Psychological effect**: The player feels "rejected" here; they do not belong.
  **心理效应**：玩家在这里感到"被拒绝"；他们不属于这里。

**On the Boundary | 在边界上:**

- Extreme dithering: the player sees overlapping patterns from both systems, Z-fighting, clashing geometries.
  极度抖动：玩家看到两个系统的重叠图案、Z-fighting、碰撞几何体。
- Both audio tones play simultaneously, creating dissonance and beating.
  两种音频音调同时播放，创造不和谐和拍频。
- **Psychological effect**: Profound confusion; the player is maximally "misread" by both systems.
  **心理效应**：深刻的困惑；玩家被两个系统最大化地"误读"。

**Doors/Gates in IN_BETWEEN | IN_BETWEEN 中的门/门:**

Certain doors only open when:
某些门只在以下情况下打开：

- The player is in system A AND the light is bright enough (intensity > 0.5), OR
  玩家在系统 A 中且光足够亮（强度 > 0.5），或
- The player is in system B AND has been in the zone long enough (duration > 20 seconds, acceptance through time rather than light).
  玩家在系统 B 中且已在该区域足够长的时间（持续时间 > 20 秒，通过时间而非光的接纳）。

This creates an asymmetry: System A rewards immediate visibility, System B rewards patience. Neither path is shorter; they're just different.

这创建了不对称：系统 A 奖励立即可见性，系统 B 奖励耐心。两条路都不更短；只是不同。

---

### 5. The Resistance Mechanic (The Override)

### 5. 抵抗机制（覆盖）

**Player Action | 玩家动作**
In the POLARIZED zone, while being gazed upon (pitch > 45°), the player holds down the "Override" key (e.g., Shift, Alt, or left-click).
在 POLARIZED 区域，被凝视时（pitch > 45°），玩家按住"覆盖"键（例如 Shift、Alt 或左键）。

**Technical Logic & Conditions | 技术逻辑与条件**

```javascript
// In Controls.js or GameState.js
function handleOverrideInput(deltaTime) {
  const isInPolarized = (chunkManager.getCurrentRoomType() === 'POLARIZED');
  const isGazing = (camera.rotation.x > Math.PI / 4);
  const overrideKeyHeld = input.isKeyDown(KeyCode.SHIFT);
  
  if (isInPolarized && isGazing && overrideKeyHeld) {
    // Enable override mode
    isOverrideActive = true;
    overrideActiveTime += deltaTime;
    
    // Force flower to maximum intensity regardless of gaze
    flower.setIntensity(1.0);
    
    // Trigger visual/audio glitch
    world.triggerPolarizationGlitch(camera.position, overrideActiveTime);
    
  } else {
    isOverrideActive = false;
    // Return to normal gaze logic
    flower.targetIntensity = 0.1; // Gaze dimming resumes
  }
}

// In DitherShader.js
// When override is active, the threshold becomes chaotic
if (overrideActive) {
  // Randomize the threshold every frame
  uThresholdBias = Math.random() * 0.8 - 0.4; // -0.4 to 0.4
  
  // Apply color inversion to a percentage of pixels
  vec4 inverted = vec4(1.0 - color.r, 1.0 - color.g, 1.0 - color.b, color.a);
  color = mix(color, inverted, sin(time * 5.0) * 0.5 + 0.5); // Flicker between normal and inverted
}
```

**System Feedback | 系统反馈**

**Immediate Visual Response (0.1 seconds after key press) | 按键后立即视觉反应（0.1 秒）:**

- A full-screen color inversion flash, lasting 0.05 seconds.
  全屏色反转闪现，持续 0.05 秒。
- DitherShader thresholds become randomized (no longer coherent).
  DitherShader 阈值变得随机化（不再连贯）。
- Nearby geometry (within 20 meters) begins flickering between normal and displaced (glitch displacement up to 1.0 meter).
  附近的几何体（在 20 米内）开始在正常和位移之间闪烁（最大位移 1.0 米）。

**Persistent Glitch Effects (while holding override) | 持续故障效应（按住覆盖时）:**

- Every 0.3 seconds, a new glitch "tear" appears in the visual field—a sudden vertical or horizontal line of inverted color lasting 0.1 seconds.
  每 0.3 秒，一个新的故障"撕裂"出现在视觉场——一条突然的反转颜色的垂直或水平线，持续 0.1 秒。
- The chessboard floor pattern (in POLARIZED) breaks; tiles randomly become white or black, destroying the ordered grid.
  棋盘格地面图案（在 POLARIZED 中）破裂；瓦片随机变白或变黑，摧毁有序的网格。
- The dithering pattern momentarily inverts and re-orients itself, creating a jarring visual stutter.
  抖动图案暂时反转并重新定向，创建刺耳的视觉口吃。

**Audio Response | 音频反应:**

- The moment the override is activated, a sharp digital "screech" sound (high-frequency noise pulse, 10 kHz+) plays for 0.2 seconds.
  覆盖激活时刻，尖锐的数字"尖叫"声（高频噪声脉冲，10 kHz+）播放 0.2 秒。
- While holding override, the low-pass filter (applied by Gaze) is violently reversed: the audio becomes extremely high-pass filtered, emphasizing the highest frequencies and creating an unpleasant, ear-fatiguing effect.
  持有覆盖时，低通滤波器（由凝视应用）被暴力反转：音频变成极端高通滤波，强调最高频率并创造不愉快、令人疲劳的效果。
- All ambient sounds drop to near-silence; only the high-frequency artifacts remain, like a digital scream.
  所有环境声音降至接近静寂；只有高频伪影残留，像数字尖叫。

**Haptic Response | 触觉反应:**

- A strong, rapid vibration pattern (frequency: 100 Hz, amplitude: max) for as long as the key is held.
  按键被按住期间，强烈、快速的振动模式（频率：100 Hz，振幅：最大）。
- This is unpleasant and discourages prolonged holding, but does not prevent it.
  这是不愉快的，阻止长时间按住，但不能阻止它。

**Cost of Resistance | 抵抗的代价:**

The override mechanic is *not powerful* in a traditional gameplay sense. It does not "break" the system permanently or "defeat" the Eye. Instead, it:

覆盖机制在传统游戏意义上*不强大*。它不会永久"破坏"系统或"击败"眼睛。相反，它：

- Creates a momentary rupture in the visual/audio coherence.
  在视觉/音频连贯性中创建暂时的裂隙。
- Leaves evidence: glitch patterns and visual scars remain in the area for 3–5 seconds after the override ends.
  留下证据：故障图案和视觉疤痕在覆盖结束后的 3–5 秒内残留在该区域。
- Costs the player comfort (unpleasant haptics, audio, disorientation).
  付出玩家舒适的代价（不愉快的触觉、音频、方向混乱）。
- Achieves nothing except the gesture itself: proof that the player *tried*.
  除了姿态本身什么都不成就：玩家*尝试过*的证明。

For the **Resister** archetype, this is valuable. For the **Submissive**, it is terrifying. For the **Boundary Tester**, it is a curiosity. The game validates all three responses.

对于**抵抗者**原型，这是有价值的。对于**顺从者**，这是可怕的。对于**边界测试者**，这是好奇。游戏验证所有三种回应。

---

### 6. The State Snapshot (Run Summary)

### 6. 状态快照（运行总结）

This system creates a "mirror" at the end of each run: a 1-bit visual pattern + 1–2 short observational sentences reflecting the player's journey.

这个系统在每次游玩结束时创建一面"镜子"：一个 1-bit 视觉图案 + 1–2 个反映玩家旅程的短观察句子。

#### 6.1 Data Collection Phase | 数据收集阶段

Run stats are collected passively throughout the session:

运行统计在整个会话中被动收集：

```typescript
interface RunStats {
  duration: number;          // Total time in seconds
  startTime: number;         // Timestamp when run began
  samples: number;           // Number of time samples taken
  sampleInterval: number;    // Time between samples (e.g., 0.5 seconds)

  // Flower/Light intensity metrics
  flowerIntensitySum: number;
  flowerIntensityMax: number;
  flowerIntensityMin: number;
  flowerIntensitySamples: number[];  // For detailed analysis

  // Gaze metrics
  gazeTimeTotal: number;     // Total time gazing at Sky Eye
  gazeEvents: number;        // Number of gaze start events
  lastGazeTime: number;      // When was the last gaze
  gazeDepthMax: number;      // Maximum pitch while gazing

  // Room stay metrics
  roomTime: {
    [key: string]: number;  // INFO_OVERFLOW, FORCED_ALIGNMENT, IN_BETWEEN, POLARIZED
  };
  currentRoom: string;

  // Positional metrics
  xPositionSum: number;
  xPositionMin: number;
  xPositionMax: number;
  onCrackTime: number;        // Time spent near crack (|x| < 5.0)

  // Interaction metrics
  overrideAttempts: number;   // Number of times player pressed override key
  overrideTimeTotal: number;  // Total duration of override active
  overrideSuccesses: number;  // How many times override actually triggered glitch
}
```

**Collection Mechanism | 收集机制:**

```javascript
// In GameState.js / GameLoop.js
function updateRunStats(deltaTime) {
  runStats.duration += deltaTime;
  runStats.samples++;
  
  // Sample flower intensity
  const currentIntensity = flower.getCurrentIntensity();
  runStats.flowerIntensitySum += currentIntensity;
  runStats.flowerIntensityMax = Math.max(runStats.flowerIntensityMax, currentIntensity);
  runStats.flowerIntensityMin = Math.min(runStats.flowerIntensityMin, currentIntensity);
  runStats.flowerIntensitySamples.push(currentIntensity);
  
  // Track gaze state
  if (isCurrentlyGazing && !wasGazingLastFrame) {
    runStats.gazeEvents++;
  }
  if (isCurrentlyGazing) {
    runStats.gazeTimeTotal += deltaTime;
    runStats.gazeDepthMax = Math.max(runStats.gazeDepthMax, camera.rotation.x);
  }
  
  // Track room type
  const currentRoom = chunkManager.getCurrentRoomType();
  if (currentRoom !== runStats.currentRoom) {
    runStats.currentRoom = currentRoom;
  }
  runStats.roomTime[currentRoom] = (runStats.roomTime[currentRoom] || 0) + deltaTime;
  
  // Track position
  runStats.xPositionSum += player.position.x;
  runStats.xPositionMin = Math.min(runStats.xPositionMin, player.position.x);
  runStats.xPositionMax = Math.max(runStats.xPositionMax, player.position.x);
  if (Math.abs(player.position.x) < 5.0) {
    runStats.onCrackTime += deltaTime;
  }
  
  // Track overrides
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

---

#### 6.2 Normalization Phase | 归一化阶段

When the run ends, raw stats are converted to normalized 0–1 metrics:

当运行结束时，原始统计被转换为归一化的 0–1 指标：

```typescript
function normalizeRunStats(rawStats: RunStats): NormalizedMetrics {
  const avgFlower = rawStats.flowerIntensitySum / rawStats.samples;
  const gazeRatio = rawStats.gazeTimeTotal / rawStats.duration;
  const overrideRatio = rawStats.overrideTimeTotal / rawStats.duration;
  
  // Which room did the player spend most time in?
  const roomRatios = {};
  for (const [room, time] of Object.entries(rawStats.roomTime)) {
    roomRatios[room] = time / rawStats.duration;
  }
  
  // How far left vs right did the player go?
  const centerX = (rawStats.xPositionMax + rawStats.xPositionMin) / 2;
  const spreadX = (rawStats.xPositionMax - rawStats.xPositionMin) / 2;
  const crackRatio = rawStats.onCrackTime / rawStats.duration;
  
  return {
    avgFlower,      // 0–1
    gazeRatio,      // 0–1
    overrideRatio,  // 0–1
    roomRatios,     // { INFO: 0–1, FORCED: 0–1, IN_BETWEEN: 0–1, POLARIZED: 0–1 }
    crackRatio,     // 0–1
    spreadX,        // 0–? (absolute distance)
  };
}
```

---

#### 6.3 Tag Generation | 标签生成

Normalized metrics are converted to discrete, human-readable tags:

归一化的指标被转换为离散的、人类可读的标签：

```typescript
function generateRunTags(metrics: NormalizedMetrics): string[] {
  const tags = [];
  
  // Light intensity tags
  if (metrics.avgFlower < 0.25) {
    tags.push('QUIET_LIGHT');
  } else if (metrics.avgFlower < 0.6) {
    tags.push('MEDIUM_LIGHT');
  } else {
    tags.push('LOUD_LIGHT');
  }
  
  // Gaze relationship tags
  if (metrics.gazeRatio > 0.5) {
    tags.push('HIGH_GAZE');
  } else if (metrics.gazeRatio < 0.15) {
    tags.push('LOW_GAZE');
  }
  
  // Room dominance tags
  const dominantRoom = Object.entries(metrics.roomRatios)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];
  
  const roomTagMap = {
    'INFO_OVERFLOW': 'INFO_MAZE',
    'FORCED_ALIGNMENT': 'CRACK_WALKER',
    'IN_BETWEEN': 'INBETWEENER',
    'POLARIZED': 'BINARY_EDGE',
  };
  
  tags.push(roomTagMap[dominantRoom]);
  
  // Positional tags
  if (metrics.crackRatio > 0.3) {
    tags.push('NEUTRAL_SEEKER');
  }
  
  // Resistance tags
  if (metrics.overrideRatio > 0.05) {
    tags.push('RESISTER');
  }
  
  return tags;
}
```

**Tag Semantics | 标签语义:**

- `QUIET_LIGHT`: The player kept the flower mostly dimmed.
  玩家大多保持花变暗。
- `LOUD_LIGHT`: The player preferred the flower bright.
  玩家更喜欢花很亮。
- `MEDIUM_LIGHT`: The player used mid-range intensities.
  玩家使用中等范围的强度。
- `HIGH_GAZE`: The player frequently looked at the Eye.
  玩家经常看眼睛。
- `LOW_GAZE`: The player avoided looking at the Eye.
  玩家避免看眼睛。
- `INFO_MAZE`: Most time in INFO_OVERFLOW.
  大部分时间在 INFO_OVERFLOW。
- `CRACK_WALKER`: Most time in FORCED_ALIGNMENT (especially on crack).
  大部分时间在 FORCED_ALIGNMENT（特别是在裂缝上）。
- `INBETWEENER`: Most time in IN_BETWEEN.
  大部分时间在 IN_BETWEEN。
- `BINARY_EDGE`: Most time in POLARIZED.
  大部分时间在 POLARIZED。
- `NEUTRAL_SEEKER`: Spent significant time on the crack (FORCED_ALIGNMENT).
  在裂缝上花费大量时间（FORCED_ALIGNMENT）。
- `RESISTER`: Used the Override mechanic (at least once).
  使用了覆盖机制（至少一次）。

---

#### 6.4 Visual Pattern Generation | 视觉图案生成

Tags drive a procedural 1-bit texture that is displayed briefly at run end.

标签驱动一个程序 1-bit 纹理，在运行结束时短暂显示。

**Pattern Selection Logic | 模式选择逻辑:**

```glsl
// In StateSnapshot.frag (Fragment Shader)

uniform int uPatternMode;  // 0: noise, 1: stripes, 2: checker, 3: radial
uniform float uDensity;    // Fill density (0–1)
uniform float uFrequency;  // Pattern frequency
uniform float uPhase;      // Offset/rotation

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float pattern = 0.0;
  
  if (uPatternMode == 0) {
    // Noise: Perlin/simplex-based
    pattern = noise(uv * uFrequency);
  } else if (uPatternMode == 1) {
    // Stripes: parallel lines with angle
    pattern = sin((uv.x + uv.y * tan(uPhase)) * uFrequency) * 0.5 + 0.5;
  } else if (uPatternMode == 2) {
    // Checkerboard
    pattern = mod(floor(uv.x * uFrequency) + floor(uv.y * uFrequency), 2.0);
  } else if (uPatternMode == 3) {
    // Radial: concentric circles or spirals
    pattern = sin(length(uv - 0.5) * uFrequency + uPhase) * 0.5 + 0.5;
  }
  
  // Apply density: threshold to get 1-bit output
  if (pattern > (1.0 - uDensity)) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // White
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black
  }
}
```

**Tag-to-Pattern Mapping | 标签到图案映射:**

```typescript
function getPatternFromTags(tags: string[]): ShaderUniforms {
  let patternMode = 0;
  let density = 0.5;
  let frequency = 8.0;
  let phase = 0.0;
  
  // Primary environment tag determines base pattern
  if (tags.includes('INFO_MAZE')) {
    patternMode = 0;  // Noise
    frequency = 16.0; // High frequency for "chaotic" feel
    density = 0.7;
  } else if (tags.includes('CRACK_WALKER')) {
    patternMode = 1;  // Stripes
    frequency = 12.0;
    phase = Math.PI / 2; // Vertical stripes
  } else if (tags.includes('INBETWEENER')) {
    patternMode = 2;  // Checkerboard
    frequency = 10.0;
    density = 0.6;
  } else if (tags.includes('BINARY_EDGE')) {
    patternMode = 3;  // Radial
    frequency = 10.0;
    phase = Math.random() * Math.PI * 2;
  }
  
  // Secondary light-intensity tag modifies density
  if (tags.includes('QUIET_LIGHT')) {
    density -= 0.2; // Sparse pattern
  } else if (tags.includes('LOUD_LIGHT')) {
    density += 0.2; // Dense pattern
  }
  
  // Resistance tag adds chaos
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

**Display Mechanism | 显示机制:**

The pattern is rendered to a small quad (e.g., 256×256 or 512×512) and displayed in the bottom-right corner of the screen, or overlaid briefly on the ground beneath the player. It fades in over 0.5 seconds, remains for 2 seconds, then fades out over 1 second. The pattern loops/tiles to fill the quad seamlessly.

图案被渲染到一个小四边形（例如 256×256 或 512×512），显示在屏幕的右下角，或短暂地覆盖在玩家下方的地面上。它在 0.5 秒内淡入，保留 2 秒，然后在 1 秒内淡出。图案循环/平铺以无缝填充四边形。

---

#### 6.5 Text Selection & Composition | 文本选择与组成

Using the same tags, a combination of pre-written sentences creates the text snapshot.

使用相同的标签，预先写好的句子的组合创建文本快照。

**Text Library (Edward Yang Tone) | 文本库（杨德昌风格）:**

The tone is observational, non-judgmental, slightly melancholic, and specific to the archetype each player is inhabiting.

语气是观察性的、非评判的、略微忧郁的，并特定于每个玩家所处的原型。

```typescript
const textTable = {
  QUIET_LIGHT: [
    {
      en: "You dimmed yourself, and the world looked less noisy.",
      zh: "你把自己调暗一点，世界就安静了一点。"
    },
    {
      en: "You kept the light low, and that seemed to help.",
      zh: "你让光保持很低，这似乎有帮助。"
    }
  ],
  
  LOUD_LIGHT: [
    {
      en: "You kept the light up, even when no one asked.",
      zh: "就算没人开口，你还是把光开得很亮。"
    },
    {
      en: "The brighter you made it, the more it hurt to look at.",
      zh: "你把它开得越亮，看着就越疼。"
    }
  ],
  
  MEDIUM_LIGHT: [
    {
      en: "You found a middle ground, though it never felt quite right.",
      zh: "你找到了一个折中方案，虽然它从来没感觉过完全对。"
    }
  ],
  
  HIGH_GAZE: [
    {
      en: "You spent most of the time looking up.",
      zh: "这一趟，你大部分时间都在抬头看。"
    },
    {
      en: "The Eye was always there, and you couldn't stop checking.",
      zh: "那只眼睛总在那儿，你停不下来确认。"
    }
  ],
  
  LOW_GAZE: [
    {
      en: "You rarely checked if the Eye was still there.",
      zh: "你很少去确认，那只眼睛还在不在。"
    },
    {
      en: "You mostly kept your eyes on the ground.",
      zh: "你大多把视线放在地上。"
    }
  ],
  
  INFO_MAZE: [
    {
      en: "You walked through a lot of signals, but not many answers.",
      zh: "你走过很多信号，却没遇到多少回答。"
    },
    {
      en: "The more you tried to see, the less you understood.",
      zh: "你试图看得越多，理解得越少。"
    }
  ],
  
  CRACK_WALKER: [
    {
      en: "You stayed on the crack longer than most would.",
      zh: "你在裂缝上待的时间，比大多数人久一点。"
    },
    {
      en: "The middle was always the hardest place to stand.",
      zh: "中间总是最难站的地方。"
    }
  ],
  
  NEUTRAL_SEEKER: [
    {
      en: "You preferred the places where nothing was certain.",
      zh: "你更喜欢没什么确定的地方。"
    }
  ],
  
  INBETWEENER: [
    {
      en: "You kept stepping into places that belonged to no one in particular.",
      zh: "你总是走进一些，不太算是谁的地方。"
    },
    {
      en: "You were always being misread, no matter where you went.",
      zh: "不管你去哪儿，你总是被误读。"
    }
  ],
  
  BINARY_EDGE: [
    {
      en: "You went right up to where things had to be either this or that.",
      zh: "你一直走到一个地方，那里所有事都只能是这样或那样。"
    },
    {
      en: "In the pure black and white, there was no room to breathe.",
      zh: "在纯黑白中，没有呼吸的空间。"
    }
  ],
  
  RESISTER: [
    {
      en: "You broke the picture once; it came back, but not quite the same.",
      zh: "你有一次把画面弄坏了，它后来恢复了，但已经不太一样。"
    },
    {
      en: "You tried to say no, and for a moment, the world listened.",
      zh: "你试着说不，一瞬间，世界听了。"
    }
  ]
};
```

---

## 🧠 Level Design: Mental State Rooms

## 🧠 关卡设计：精神状态空间

### Core Design Philosophy | 核心设计理念

We implement **Mental State Rooms**, not linear levels.

我们实现的是**精神状态空间**，而不是线性关卡。

> **Implementation Note | 实现备注**
> We do **not** gate progress by clearing rooms. Rooms are sampled and recombined per session (like emotional weather), not unlocked linearly.
> We do **not** offer explicit rewards for "winning" rooms.
> We **do** offer the implicit reward of understanding one's own response pattern.
>
> 我们不会通过"通关"来推进进度。房间更像"情绪天气"，在每次游玩中被抽样重组，而不是线性解锁。
> 我们不会为"赢"房间提供明确的奖励。
> 我们**确实**提供了理解自己反应模式的隐性奖励。

---

### 1. INFO_OVERFLOW (High Noise, No Response)

### 1. INFO_OVERFLOW（高噪点，无回应）

**Conceptual Framing | 概念框架**

The anxiety of over-connection: you scream into the void, and the void replies with static. This room mirrors the experience of scrolling social media endlessly, seeing mountains of information but receiving no feedback, no dialogue, no sense of being heard.

过度连接的焦虑：你向虚空呐喊，虚空以静电噪音回应。这个房间镜像了无休止滚动社交媒体的体验，看到大量信息但没有反馈、没有对话、没有被听见的感觉。

**Visual Language | 视觉语言**

- High-frequency dithering pattern (0.8–1.0 density), creating visual "noise."
  高频抖动图案（0.8–1.0 密度），创建视觉"噪点"。
- Distant buildings flicker and swap geometry every 2–6 seconds depending on flower intensity.
  远处的建筑根据花的强度每 2–6 秒闪烁和交换几何体。
- Digital rain: vertical lines descending at varying speeds, like falling data packets.
  数字雨：以不同速度下降的垂直线，像落下的数据包。
- No clear focal points; the eye cannot rest anywhere.
  没有清晰的焦点；眼睛无处可放。
- The horizon is not defined; the world fades into pure noise within 30 meters.
  地平线没有定义；世界在 30 米内消褪成纯噪点。

**Audio Language | 音频语言**

- Base layer: constant low-frequency hum (~60 Hz), barely perceptible but creating subconscious unease.
  基础层：持续的低频嗡鸣（~60 Hz），几乎不可感知但创造潜意识的不安。
- Second layer: random beeps and chirps at varying frequencies (2–10 kHz), creating a sense of "missed messages" or "notifications you can't read."
  第二层：以不同频率（2–10 kHz）随机哔哔声和啁啾声，创造"错过的消息"或"你无法阅读的通知"的感觉。
- The beep frequency and intensity increase with flower brightness.
  哔哔声频率和强度随花的亮度增加。
- No rhythm or pattern; the sounds are unpredictable, preventing the listener from anticipating or finding comfort in repetition.
  没有节奏或图案；声音是不可预测的，防止听者期待或在重复中找到舒适。

**Interactive Mechanics | 交互机制**

```javascript
// INFO_OVERFLOW specific systems
const noiseDensityMap = {
  0.1: 0.75,  // Dim light
  0.3: 0.82,
  0.5: 0.88,
  0.7: 0.95,
  1.0: 1.0    // Full brightness = maximum noise
};

const buildingRefreshIntervalMap = {
  0.1: 6.0,   // Dim: buildings stay stable
  0.3: 5.0,
  0.5: 3.5,
  0.7: 2.5,
  1.0: 1.5    // Bright: chaos
};
```

**Player Journey in INFO_OVERFLOW | 在 INFO_OVERFLOW 中的玩家旅程**

1. **Initial Entry | 初始进入**: Player's instinct is to brighten the light to "see better."
   玩家的本能是增亮光来"看得更好"。
2. **Negative Feedback | 负反馈**: The brighter they get, the more chaotic the world becomes; they realize increasing light is counterproductive.
   他们越亮，世界越混乱；他们意识到增加光会适得其反。
3. **Adaptation | 适应**: Player learns to keep light around 0.3–0.4 (low-medium), finding a "survivable" level of noise.
   玩家学会保持光约 0.3–0.4（低-中等），找到"可生存"的噪声水平。
4. **Lingering Doubt | 挥之不去的疑惑**: Even at optimal settings, there's no sense of progress or understanding. The information keeps flowing, and nothing is resolved.
   即使在最优设置下，也没有进展或理解的感觉。信息继续流动，没有解决任何东西。
5. **Exit Option | 退出选项**: The player can navigate through the room and exit (there's no "trap"), but there's a psychological weight to leaving without answers.
   玩家可以导航穿过房间和离开（没有"陷阱"），但离开而没有答案有心理重量。

**Design Intent | 设计意图**

This room teaches the player that **more input ≠ more understanding**. It's a meditation on the contemporary phenomenon of information overload, where constant stimulation paradoxically leads to numbness and passivity.

这个房间教导玩家**更多输入≠更多理解**。这是对当代信息过载现象的冥想，其中持续刺激悖论性地导致麻木和被动。

---

### 2. FORCED_ALIGNMENT (The Split World)

### 2. FORCED_ALIGNMENT（分裂的世界）

**Conceptual Framing | 概念框架**

The pressure to pick a side. No true middle ground allowed. This room embodies the contemporary polarization of social/political discourse, where nuance is collapsed into binary oppositions, and neutrality is treated as betrayal.

被迫选边站的压力，不允许有真正的中间地带。这个房间体现了当代社交/政治话语的两极分化，其中细微差别被折叠为二元对立，中立被视为背叛。

**Visual Language | 视觉语言**

- A massive vertical chasm divides the space into left and right halves.
  一条巨大的垂直裂隙将空间分为左右两半。
- Left side: Clean, geometric, well-lit structures (low dithering density ~0.4). The aesthetic is pristine but oppressively orderly.
  左侧：清洁、几何、光线充足的结构（低抖动密度 ~0.4）。美学上原始但压抑地有序。
- Right side: Broken, organic, partially collapsed structures (high dithering density ~0.7). Chaotic but more visually "honest."
  右侧：破碎、有机、部分坍塌的结构（高抖动密度 ~0.7）。混乱但视觉上更"诚实"。
- The crack itself: An abyss of pure black, no bottom visible. Traversing it means crossing into uncertainty.
  裂缝本身：纯黑的深渊，看不到底部。穿过它意味着进入不确定性。
- Line cables that span the chasm like ideological banners, taut and trembling.
  跨越裂隙的线缆像意识形态横幅，紧绷且颤抖。
- The floor on the crack: Semi-transparent or glitching, implying instability underfoot.
  裂缝上的地板：半透明或故障，暗示脚下的不稳定。

**Audio Language | 音频语言**

- Left side: A single, sustained harmonic tone (major 3rd, ~330 Hz and ~550 Hz) played softly, evoking stability and order.
  左侧：一个单一的、持续的和谐音（大三度，~330 Hz 和 ~550 Hz）以低音量播放，唤起稳定和秩序。
- Right side: A discordant tone (tritone or sus-2 chord) played at the same volume, creating mild unease.
  右侧：以相同音量播放的不和谐音（三全音或 sus-2 和弦），创造轻微的不安。
- The crack: Both tones play simultaneously, creating interference beats (~20 Hz), producing a pulsing dissonance that is profoundly uncomfortable to listen to for extended periods.
  裂缝：两种音调同时播放，创造干涉节拍（~20 Hz），产生脉动的不和谐，长期听非常不舒适。
- The binaural beat frequency changes based on the player's X position, creating a dynamic audio landscape that maps to spatial location.
  双耳节拍频率根据玩家的 X 位置变化，创建映射到空间位置的动态音频景观。

**Player Journey in FORCED_ALIGNMENT | 在 FORCED_ALIGNMENT 中的玩家旅程**

1. **Initial Encounter | 初始遭遇**: The player sees the split and is initially drawn to explore both sides.
   玩家看到分裂并最初被吸引探索两侧。
2. **Comfort Discovery | 舒适发现**: Moving fully to one side makes the world feel more "coherent" (less dithering, stable ground, pleasant audio).
   完全移到一侧使世界感觉更"连贯"（更少抖动、稳定的地面、愉快的音频）。
3. **Psychological Cost | 心理代价**: But staying on one side means accepting the distortion of the other side (it becomes noisy, unstable). The player is complicit in "erasing" the other perspective.
   但留在一侧意味着接受另一侧的扭曲（它变得嘈杂、不稳定）。玩家共谋在"抹除"另一种观点。
4. **The Neutral Option | 中立选项**: The player can return to the crack and endure the discomfort of being between. This is the "enlightened" choice, but it's painful.
   玩家可以回到裂缝并忍受处于中间的不适。这是"开明"的选择，但很痛苦。
5. **Repeated Choice | 重复选择**: The player may oscillate between sides and the crack, testing the boundaries and costs repeatedly.
   玩家可能在侧面和裂缝之间摆动，重复测试边界和代价。

**Design Intent | 设计意图**

This room externalizes the internal conflict of political/ideological standing. It offers no "correct" answer: both sides are equally valid and equally limiting. The crack is "correct" in principle but psychologically untenable. The game validates all three strategies without ranking them.

这个房间外化了政治/意识形态立场的内部冲突。它不提供"正确"的答案：两侧都同样有效和同样有限。裂缝原则上是"正确的"但心理上站不住脚。游戏不排名地验证所有三种策略。

---

### 3. IN_BETWEEN (The Glitch)

### 3. IN_BETWEEN（故障）

**Conceptual Framing | 概念框架**

Being misread by both systems: rejected as noise in one context, barely accepted as signal in another. This room is for those who don't fit neatly into established categories—minorities, hybrids, those caught between cultures or identities.

同时被两个系统误读：在一个背景中被拒绝为噪点，在另一个中勉强被接纳为信号。这个房间适用于不符合既定类别的人——少数民族、混合体、被夹在文化或身份之间的人。

**Visual Language | 视觉语言**

- Two overlapping building systems with incompatible visual languages: one rectilinear and clean, the other fractured and organic.
  两个有不兼容视觉语言的重叠建筑系统：一个矩形和清洁，另一个破碎和有机。
- Z-fighting (texture fighting) at boundaries, creating visual noise where the systems intersect.
  边界处的 Z-fighting（纹理争斗），在系统交集处创建视觉噪点。
- Geometry that is ambiguous: partially rendered in one system's style, partially in another's.
  几何体是模糊的：部分按一个系统的风格呈现，部分按另一个的。
- Surfaces that reflect light differently depending on which system "claims" them at that moment, creating a flickering appearance.
  表面根据哪个系统在该时刻"声称"它们而不同地反射光，创建闪烁外观。
- Floor: dual-layer grid, one rotated ~30° relative to the other, creating a moiré pattern.
  地板：双层网格，相对于另一个旋转约 30°，创建莫尔纹图案。

**Audio Language | 音频语言**

- System A: A harmonic chord (perfect fifth, consonant) played at low volume.
  系统 A：一个和谐和弦（完美五度、辅音）以低音量播放。
- System B: A dissonant chord (tritone or cluster) at the same volume.
  系统 B：以相同音量的不和谐和弦（三全音或簇）。
- On boundaries: Both chords overlap, creating complex harmonic interference.
  在边界上：两个和弦重叠，创建复杂的和谐干涉。
- The player's light triggers different resonances in each system (System A: confirmatory tones; System B: alarm tones).
  玩家的光在每个系统中触发不同的共鸣（系统 A：确认音；系统 B：警报音）。

**Player Journey in IN_BETWEEN | 在 IN_BETWEEN 中的玩家旅程**

1. **Discovery | 发现**: The player encounters incompatible systems and realizes their responses vary contextually.
   玩家遇到不兼容的系统并意识到他们的反应因背景而异。
2. **Frustration | 沮丧**: An action that works in System A causes problems in System B, and vice versa. The player cannot be "consistently right."
   在系统 A 中工作的行为在系统 B 中造成问题，反之亦然。玩家不能"始终正确"。
3. **Adaptation | 适应**: The player learns to navigate by playing each system's rules when in each system's territory.
   玩家学会通过在每个系统的领地中播放每个系统的规则来导航。
4. **Deeper Realization | 更深的认识**: Even this adaptive strategy fails on the boundaries; the player discovers there's no universal solution.
   即使这种适应策略在边界上失败；玩家发现没有通用解决方案。
5. **Coping | 应对**: The player either compartmentalizes (treating each system separately) or embraces the ambiguity (accepting contradiction).
   玩家要么隔离（分别对待每个系统）要么接受歧义（接受矛盾）。

**Design Intent | 设计意图**

This room reflects the lived experience of people navigating multiple, incompatible social systems. There is no "solution"; there is only the daily practice of context-switching and the psychological toll it takes. The game validates both the compartmentalist and ambiguity-embracing strategies.

这个房间反映了人们导航多个、不兼容社交系统的亲身体验。没有"解决方案"；只有上下文切换的日常实践及其造成的心理代价。游戏验证了隔离主义者和歧义拥抱两种策略。

---

### 4. POLARIZED (The Pure Binary)

### 4. POLARIZED（纯粹二元）

**Conceptual Framing | 概念框架**

Total submission to 1-bit logic: no gray, no dithering, only hard decisions. This is the room where the world has collapsed into pure binary opposition, where nuance is obliterated and every choice is a binary switch.

对 1-bit 逻辑的彻底臣服：没有灰色，没有抖动，只剩硬性的决定。这是一个世界已经崩溃为纯粹二元对立的房间，细微差别被抹除，每个选择都是二元开关。

**Visual Language | 视觉语言**

- **Zero dithering**: Pure 1-bit rendering. The world is composed entirely of solid black and solid white, with razor-sharp boundaries.
  **零抖动**：纯 1-bit 渲染。世界完全由纯黑和纯白组成，具有刀片锋利的边界。
- **No gradients or shadows**: All surfaces are either fully lit (white) or completely in shadow (black).
  **无渐变或阴影**：所有表面要么完全点亮（白色），要么完全在阴影中（黑色）。
- **Geometric precision**: All geometry is made of rectangles, cubes, and lines. No curves, no organic shapes.
  **几何精度**：所有几何体由矩形、立方体和线组成。没有曲线，没有有机形状。
- **Chessboard floors**: The most iconic 1-bit pattern, emphasizing the black-and-white duality.
  **棋盘格地板**：最标志性的 1-bit 图案，强调黑白对偶。
- **Cables as borders**: All cables and lines trace the exact black-white boundaries, forming a skeleton of the world.
  **作为边界的电缆**：所有电缆和线追踪确切的黑白边界，形成世界的骨架。
- **Sky Eye**: Dominates the visual field, impossibly large, rendered as concentric 1-bit circles.
  **天空之眼**：在视觉场中占据主导，不可能地大，呈现为同心 1-bit 圆。

**Audio Language | 音频语言**

- **Binary beeps**: The only sounds are crisp, digital beeps at two frequencies (e.g., 440 Hz and 880 Hz), representing "on" and "off."
  **二进制哔哔声**：唯一的声音是两个频率的清晰、数字哔哔声（例如 440 Hz 和 880 Hz），代表"开"和"关"。
- **No ambiguity in tone**: There is no sustain, no fade, only sudden onset and offset.
  **音调中无歧义**：没有延音，没有淡入淡出，只有突然的开始和结束。
- **Rhythm**: The beeps follow a simple, relentless 4/4 beat, like a digital pulse or clock ticking, inescapable and mechanical.
  **节奏**：哔哔声遵循简单的、无情的 4/4 节拍，像数字脉冲或时钟滴答，逃脱和机械。
- **The Gaze intensifies**: When looking at the Eye, the beeps speed up slightly, creating a sense of increasing pressure.
  **凝视强化**：当看眼睛时，哔哔声略微加速，创造增加压力的感觉。

**Design Intent | 设计意图**

This room is the game's philosophical climax. It represents the totalitarian endpoint of the binary logic: a world where nuance, compromise, and ambiguity are not just discouraged but technically impossible. The Override is not a "power" but a defiant gesture—beautiful in its futility.

这个房间是游戏的哲学高潮。它代表二元逻辑的威权终点：一个世界，其中细微差别、妥协和歧义不仅被阻止，而且在技术上是不可能的。覆盖不是"力量"而是挑衅姿态——在其徒劳中很美。

---

## 🎛 Parameter Reference

## 🎛 参数参考

### Shader Uniforms | 着色器 Uniforms

```glsl
// Global parameters for all rooms | 所有房间的全局参数
uniform float uNoiseDensity;    // 0–1, controls dithering pattern density
                                // 0–1，控制抖动图案密度
uniform float uThresholdBias;   // -0.5 to 0.5, shifts black/white balance
                                // -0.5 到 0.5，转变黑/白平衡
uniform float uTemporalJitter;  // 0–1, controls temporal animation of dithering
                                // 0–1，控制抖动的时间动画
uniform float uContrast;        // 1.0+ controls overall contrast
                                // 1.0+，控制整体对比度
uniform float uCRTCurvature;    // 0–0.1, CRT monitor curve distortion
                                // 0–0.1，CRT 监视器曲线失真
uniform float uScanlineIntensity; // 0–1, horizontal scan line effect
                                  // 0–1，水平扫描线效果

// Vertex displacement (glitch) | 顶点位移（故障）
uniform float uGlitchAmount;    // 0–1, magnitude of vertex displacement
                                // 0–1，顶点位移的幅度
uniform float uGlitchSpeed;     // Hz, frequency of glitch animation
                                // Hz，故障动画的频率

// Color effects | 颜色效果
uniform float uColorInversion;  // 0–1, 0=normal, 1=fully inverted
                                // 0–1，0=正常，1=完全反转
uniform float uSaturation;      // 0–1, 0=grayscale, 1=full color
                                // 0–1，0=灰度，1=全色
```

---

## 🛠 Technical Roadmap

## 🛠 技术路线图

### Phase 1: The Foundation (Shader & State)

### 第一阶段：基础（着色器与状态）

**Duration | 持续时间**: 2–3 weeks | 2–3 周

**Objectives | 目标:**

- Refactor `ChunkManager` to support `roomType` enum and per-room configuration.
  重构 `ChunkManager` 以支持 `roomType` 枚举和每个房间的配置。
- Upgrade `DitherShader` with all required uniforms and temporal animation support.
  使用所有必需的 uniforms 和时间动画支持升级 `DitherShader`。
- Implement basic `Flower` intensity control (manual and automatic via Gaze).
  实现基本的 `Flower` 强度控制（手动和通过凝视自动）。
- Set up `RunStats` collection infrastructure (non-intrusive background recording).
  设置 `RunStats` 收集基础设施（非侵入式后台记录）。

**Deliverables | 交付物:**

- `ChunkManager.js` can generate and manage chunks with assigned `roomType`.
  `ChunkManager.js` 可以生成和管理分配的 `roomType` 的块。
- `DitherShader.js` exposes `uNoiseDensity`, `uThresholdBias`, `uTemporalJitter`, `uContrast` as dynamically updateable uniforms.
  `DitherShader.js` 将 `uNoiseDensity`、`uThresholdBias`、`uTemporalJitter`、`uContrast` 作为动态可更新的 uniforms 公开。
- `FlowerProp.js` supports `setIntensity(0–1)` with smooth lerping.
  `FlowerProp.js` 支持 `setIntensity(0–1)` 具有平滑插值。
- `RunStats` object persists and accumulates data throughout a session.
  `RunStats` 对象在整个会话中保持和累积数据。

**Success Criteria | 成功标准:**

- Switching between INFO_OVERFLOW and POLARIZED rooms causes visible shader changes.
  在 INFO_OVERFLOW 和 POLARIZED 房间之间切换导致可见的着色器变化。
- Flower intensity can be manually controlled and displays smooth visual feedback.
  花的强度可以手动控制并显示平滑的视觉反馈。
- No performance regression; frame rate remains stable.
  无性能回退；帧速率保持稳定。

---

### Phase 2: The Discipline (Mechanic)

### 第二阶段：规训（机制）

**Duration | 持续时间**: 2–3 weeks | 2–3 周

**Objectives | 目标:**

- Implement the Gaze mechanic: automatic intensity reduction when gazing at Sky Eye.
  实现凝视机制：仰望天空之眼时自动强度降低。
- Integrate audio filtering (low-pass when gazing).
  集成音频过滤（凝视时低通）。
- Add haptic feedback (if platform supports).
  添加触觉反馈（如果平台支持）。
- Implement camera pitch detection and smooth state transitions.
  实现摄像机 pitch 检测和平滑状态转变。

**Deliverables | 交付物:**

- `Controls.js` detects Gaze state (pitch > 45°) and broadcasts events.
  `Controls.js` 检测凝视状态（pitch > 45°）并广播事件。
- `Flower` responds to Gaze by auto-lerping intensity.
  `Flower` 通过自动插值强度对凝视做出反应。
- `AudioSystem` applies low-pass filter smoothly when Gazing.
  `AudioSystem` 在凝视时平滑地应用低通滤波器。
- Haptic pulse patterns implemented (single pulse on Gaze start, periodic while gazing).
  触觉脉冲图案实现（凝视开始时单脉冲，凝视时定期）。

**Success Criteria | 成功标准:**

- Gazing up clearly feels punitive (dim, muffled, vibration).
  向上凝视明显感觉像惩罚（变暗、闷、振动）。
- The effect is smooth and not jarring.
  效果平滑而不刺耳。
- Players naturally learn the Gaze rule within the first 30 seconds of play.
  玩家在游戏的前 30 秒自然学会凝视规则。

---

*Document Version: 1.0 (Complete Design Specification with Full Chinese-English Alignment)*

*文档版本：1.0（完整的设计规范，具有完整的中英文对应）*