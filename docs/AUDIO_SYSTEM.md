# 1-bit Chimera Void - 声音系统文档

> 最后更新:2026-06-12

## 概览 (Overview)

**1-bit Chimera Void** 的声音系统是一个基于 **Web Audio API** 构建的纯**程序化音频引擎**。它不依赖任何外部音频文件（如 mp3/wav），而是通过代码实时生成所有的声波。

这种设计通过创造一种**粗糙、数字、二进制**的听觉体验，完美契合了项目的 "1-bit" 视觉美学。

- **文件路径**: `src/audio/AudioController.ts`（业务逻辑）、`src/audio/AudioEngine.ts`（Web Audio 底层引擎）
- **调参入口**: `src/config/audio.ts` —— 所有音频常量的唯一来源，本文标注的常量名均指向该文件
- **核心技术**: `window.AudioContext`
- **设计哲学**: 极简主义、数字噪声、频率调制；每个房间有自己的"音景身份"。

---

## 核心架构 (Core Architecture)

该系统依赖于 **振荡器 (Oscillators)**（声源）、**滤波器 (Filters)**（音色塑造）和 **增益节点 (GainNodes)**（音量控制）的链路来合成声音。

### 音频图结构

```mermaid
graph LR
    Oscillators[振荡器 Oscillators] --> Filters[滤波器 Filters]
    Filters --> GainNodes[增益节点 Gain Nodes]
    GainNodes --> MasterGain[主增益 Master Gain]
    MasterGain --> GazeFilter[凝视低通滤镜 Gaze Low-Pass Filter]
    GazeFilter --> Destination[音频输出 Destination]
```

### 生命周期 (Lifecycle)

- **初始化**: `core/PauseController.ts` 在首次用户手势时调用 `audio.init()`（自动播放策略；同时启动环境低鸣），若仍在开始界面/暂停菜单则立即 `suspend()`。
- **暂停/恢复**: ESC 暂停、标签页隐藏会 `suspend()` 上下文。所有 `setTimeout` 链式调度器（雨滴、GLITCH snap、POLARIZED 节拍）在挂起时**跳过发声但保持调度存活**，避免恢复瞬间堆积爆音。
- **销毁**: `dispose()` 同步拆除所有持续节点并关闭上下文。

---

## 声音层级 (Sound Layers)

### 1. 环境氛围 (Ambient Atmosphere) —— "低鸣 (The Drone)"

持续运行的背景双锯齿波，定义虚空的基调。**自房间音景系统引入后，低鸣会随房间重新调音**——节点常驻不重建，仅以 `setTargetAtTime` 滑变频率（滑变时间常数 `ROOM_AMBIENT_CONFIG.droneRetuneGlide` = 0.4s）。

- **默认（未入房间）**: 35.0Hz / 35.5Hz，低通 200Hz（`ROOM_AMBIENT_CONFIG.droneFilterFreq`），增益 0.08。
- **逐房间调音**（`RoomConfig.ts` 的 `RoomAudioConfig` × `ROOM_AMBIENT_CONFIG.harmonicRatio`）:

| 房间 | 基频 | 谐波关系 | 伙伴频率 |
| :--- | :--- | :--- | :--- |
| INFO_OVERFLOW | 60Hz | dissonant (×1.4) | 84Hz |
| FORCED_ALIGNMENT | 55Hz | binaural (+0.5Hz 失谐) | 55.5Hz |
| IN_BETWEEN | 50Hz | dissonant (×1.4) | 70Hz |
| POLARIZED | 40Hz | consonant (×2 纯八度，无拍频) | 80Hz |

- **防抖**: 房间切换后 `ROOM_AMBIENT_CONFIG.retuneDebounceMs` = 250ms 内不重配置，避免在区块接缝来回横跳时抖动节点。

### 2. 凝视滤镜 (The Gaze Filter) —— "动态沉浸"

应用于主输出通道的全局低通滤波器（`AudioEngine`）。

- **正常状态**: 完全打开（`AUDIO_MASTER.gazeFilterOpen` = 20,000Hz）。
- **凝视天眼**: 目标截止频率随凝视强度下降至 `AUDIO_MASTER.gazeFilterClosed` = 400Hz，世界声音"发闷"如潜入水中。
- **插值**: 在**对数频率域**指数逼近（`AUDIO_MASTER.gazeFilterLerpSpeed` = 6.0/s），保证"闷掉"的感知时长帧率无关且符合预期（旧版线性 Hz 插值会拖长 2-3 倍）。
- **复用管线**: 日落结算时 `duckForSnapshot()` 通过 `AudioEngine.applyTemporaryLowpass` 在同一滤镜上压一个临时上限（见第 8 节）。

### 3. 房间音景 (Room Soundscape)

`RoomFlowUpdater` 检测到房间切换时调用 `audio.onRoomChange(prev, new, roomConfig.audio)`：先立即播放切换音（噪声 + 锯齿扫频 ~400ms，冷却 `ROOM_AMBIENT_CONFIG.whooshMinInterval` = 1.8s 防止沿边界横跳连发），再防抖 250ms 重配置低鸣 / 噪声床 / 双耳节拍 / POLARIZED 节拍。

#### 噪声床 (Noise Bed)
共享一块池化的 2s 循环白噪声缓冲（`ROOM_AMBIENT_CONFIG.noiseBufferSeconds`），按房间带通滤波：

- **INFO_OVERFLOW**（noiseGain 0.15 > `noiseHighBandThreshold` 0.1）→ 高频嘶声带，中心 `noiseBandHighFreq` = 4000Hz，Q 0.6。
- **IN_BETWEEN**（noiseGain 0.08）→ 低钝噪声带，中心 `noiseBandLowFreq` = 600Hz，Q 0.8。
- **FORCED_ALIGNMENT / POLARIZED**: 无噪声床。
- 增益统一封顶 `noiseGainCeiling` = 0.15，淡入淡出 `noiseFadeTime` = 0.6s。

#### 强制对齐 (FORCED_ALIGNMENT) —— 双耳节拍的两层语义
左耳 55Hz 正弦、右耳 75Hz（基频 + 拍频 20Hz，来自房间配置），大脑感知 20Hz 幻听拍频。`RiftMechanic.update` 每帧用**两个独立读数**驱动 `updateBinauralPosition(sideOffsetX, riftDistance)`：

- **选边 → 失谐方向**: 有符号偏移来自房间的**语义轴** `faSideAxisX`（簇中心）——左侧（负）拍频收窄向谐和、右侧（正）加宽向不谐和（拍频 = 20 × (1 + side × `BINAURAL_SIDE_CONFIG.detuneGain` 0.6)，side 按 `sideHalfRange` = 80m 归一，滑变 0.15s）。你听到的是"选了房间的哪一边"，而非离哪条裂缝近。
- **裂缝距离 → 响度**: 强度 = 1 − 距最近**物理裂缝**距离 / `BINAURAL_SIDE_CONFIG.fieldWidth`（= CHUNK_SIZE/2 = 40m）。裂缝每 80m 一条、各自携带声场，相邻声场恰好铺满全房。

#### 两极分化 (POLARIZED) —— 二元脉冲层
440/880Hz 正弦短音严格交替（`POLARIZED_BEAT_CONFIG.lowFreq`/`highFreq`）——非此即彼，没有中间值。基础间隔 `baseInterval` = 0.75s；**凝视压缩间隔**（÷(1 + `gazeRateGain` 0.3 × 凝视强度)），节拍器随凝视加速。单脉冲音量 0.05、时长 0.12s。频率位于 400Hz 凝视低通之上，因此凝视的"闷感"在这个房间终于可闻。

#### 信息溢出 (INFO_OVERFLOW) —— 数据啁啾
随机高频方波脉冲（2000-10000Hz）。触发率为帧率无关的 ~2%/帧@60fps 基准（`GAMEPLAY.INFO_CHIRP_PROBABILITY`），并按花强度缩放（`INFO_CHIRP_FLOWER_PROB_FLOOR` 0.5 + 花 × `INFO_CHIRP_FLOWER_PROB_GAIN` 1.5：暗花减半、盛放翻倍）；单次音量也随花强度从 `INFO_CHIRP_CONFIG.minVolume` 0.02 升至 `maxVolume` 0.06——越亮越吵的无意义嘈杂。

### 4. 裂隙音频 (Rift Audio) —— FORCED_ALIGNMENT

由 `world/RiftMechanic.ts` 驱动：

- **虚空迷雾**: 循环白噪声 + 低通 600Hz（0.2Hz LFO 扫掠 ±400Hz）。音量 = 距最近裂缝的接近度 × `RIFT_AUDIO_CONFIG.fogMaxVolume` 0.8，可闻范围 `BINAURAL_SIDE_CONFIG.fogAudibleRange` = 40m——在房间任何位置都能听到、且总指向最近的裂缝。
- **坠落**: 带通噪声 400→2000Hz 3 秒上扫（风声）+ 锯齿波 200→50Hz 下坠，淡入 `RIFT_AUDIO_CONFIG.fallFadeIn` 0.5s。
- **重生**: 反向吸入——正弦 50→800Hz，0.3s。
- 离开房间时 `RiftMechanic.onExit` 停止迷雾。

### 5. 天气音频 (Weather Audio, 2026-06 版)

**契约**: `main.ts` 每帧调用 `updateWeatherAudio(weatherType, intensity, onset)`。`onset` 是事件的"开场广播窗口"（`WeatherState.weatherOnset`，真实事件起始后 1→0 衰减，窗口 `ONSET_SECONDS` = 1.6s；瞬态环境 glitch 恒为 0）。

**层增益** = max(intensity, onset) × `WEATHER_AUDIO.baseGain`(0.30) × (1 + onset × (`onsetSwellMult`(1.8) − 1))——开场涌起再回落；平滑 `gainSmoothing` 0.1s。每种天气绑定一个房间身份：

| 天气 | 房间风味 | 构成 | 关键常量 (`WEATHER_AUDIO`) |
| :--- | :--- | :--- | :--- |
| **CLEAR** (0) | — | 无；切换时拆除全部天气节点 | — |
| **STATIC** (1) | FA 扫描风暴 | 50Hz 三角波 drone（0.3Hz LFO ±10Hz）+ 100Hz 泛音，整床叠加 **0.5–1.5Hz 幅度调制扫掠**（每周期一条扫描带掠过） | `staticTremoloRateMin/Max` 0.5/1.5、`staticTremoloDepth` 0.5 |
| **RAIN** (2) | INFO 数据暴雨 | 下降正弦音阶 tick（`WEATHER_AUDIO_CONFIG.rainNotes` 1200→300Hz，每音 0.4s）；**强度压缩间隔** 500→140ms；底层叠 5000Hz 带通**嘶声层**，子增益再乘强度（整体平方律——大雨可闻地变成倾盆） | `rainIntervalMaxMs/MinMs` 500/140、`rainHissFreq` 5000、`rainHissMaxGain` 0.5 |
| **GLITCH** (3) | POLARIZED 断裂雷暴 | 开场一次性 burst（8-16 段 2-6kHz 方波、30% 静默间隙、0.6-1.0s）+ **稀疏 snap 瞬态**每 2-4s 一记短促方波爆裂（呼应画面反相闪击）；真实事件首记 snap 提前至 250ms 落进开场窗口 | `glitchSnapIntervalMinS/MaxS` 2/4、`glitchSnapVolume` 0.8、`glitchSnapDuration` 0.07、`glitchOnsetSnapDelayMs` 250 |

**节点生命周期**: 天气类型变化时先同步拆除旧层（stop 振荡器/噪声源 + 断开层增益）再启动新层；`dispose()` 走同一路径。调度器在挂起时跳过发声、保活节奏。

### 6. 花 (The Flower)

- **状态确认音**: 花强度跨越 0.3 / 0.7 边界时播放纯五度/四度滑音（升 400→600Hz / 降 600→450Hz），由每帧 `updateFlowerAudio(intensity)` 检测。
- **调整确认音**: `playFlowerChangeTone(intensity)` **事件驱动**——滚轮 / Q-E / 触屏的输入回调直接调用（旧的逐帧阈值检测在 ≥30fps 下永不触发，已移除）。音高 = `FLOWER_CHANGE_TONE_CONFIG.baseFrequency` 150 + 强度 × `frequencyRange` 350 Hz，防抖 `debounceSeconds` 0.09s。
- **"被注视"低鸣**: 花亮过 `FLOWER_ATTENTION_CONFIG.threshold` 0.6 后 46Hz 正弦低鸣淡入（`maxGain` 0.05，0.15Hz LFO 呼吸）——亮花引来天眼的注意。

### 7. 凝视 / 反抗 (Gaze / Override)

- **凝视开始**: `playGazeStartPulse` 正弦 200→80Hz 低频脉冲（onGazeStart 回调）。
- **反抗成功**: `playOverrideTear` 白噪声爆发 0.3s、带通 2000Hz——POLARIZED 凝视中长按成功。
- **反抗被拒**: `playOverrideDeniedThud` 极轻闷响（70→36Hz，音量 `OVERRIDE_DENIED_CONFIG.volume` 0.07）——仅 POLARIZED 内**未凝视**按键（'no-gaze'）；冷却中只有视觉反馈；**错误房间刻意静默**（只有这里可以反抗）。
- **远处的撕裂**: `playDistantTear(proximity)`——剪影同类的反叛（`FigureSystem`，约每 150-360s 一次、距离带 30-60m），在 2s 胸光涌起后身体开始碎裂的瞬间响起：更轻（0.03-0.12）、更钝（低通 900Hz）、更长（0.5s）——撕裂永远发生在**别处**。

### 8. 日落 / 结算 / 昼夜 / 日蚀

- **日落预兆**: `updateSunsetForeshadow(level)` 每帧驱动——日相最后 30s（`SUNSET_FORESHADOW.LEAD_SECONDS`）内环境低鸣整体下滑最多 12%（`SUNSET_FORESHADOW_AUDIO.droneDropFraction`，相对当前房间调音；写入按 `applyEpsilon` 0.005 去抖）。
- **结算**: 快照落下时 `duckForSnapshot()` 压 700Hz 低通上限、保持 3s（`SNAPSHOT_AUDIO_CONFIG.lowpassFreq`/`holdSeconds`），世界可听地退后；暂停冻结计时。仅当运行 ≥30s（`GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT`）出快照时触发。
- **昼夜过渡**: `playDayNightTransition(toNight)` 三角波扫频（入夜 800→100Hz、日出 100→800Hz）。
- **日蚀**: 白天 0.03/s 概率随机触发（10-30s）——复用 `playEyeBlink` 并强制一场 GLITCH 天气（雷暴层随之而来）。

### 9. 电缆 / 脚步 / 天眼

- **电缆嗡鸣**: `core/CableAudioUpdater.ts` 每 3 帧检测（`CABLE_PROXIMITY.CHECK_INTERVAL`）：<8m 启动、>12m 停止；100Hz 锯齿波（`CABLE_AUDIO_CONFIG.humFrequency`）+ 0.5Hz LFO，音量随距离渐近至 `maxVolume` 0.15。**脉冲**: <5m（`PULSE_DISTANCE`）每次检测 2.5% 概率、冷却 2.5s，方波 1200-1700→600Hz 滴答。
- **脚步**: 地面移动时方波 80-120Hz 咔哒，节流 `FOOTSTEP_CONFIG.minInterval` 0.25s。
- **天眼眨眼**: 正弦 400→100Hz。眨眼率 (0.06 + 花 × 0.24)/s × (1 − 凝视) × 风暴系数——亮花多眨、直视瞪回不眨、暴风雨躁动。

---

## API 完整方法列表

### 初始化与控制

| 方法 | 描述 |
| :--- | :--- |
| `init()` | 初始化音频上下文并启动环境低鸣（须在用户手势内） |
| `setVolume(value)` | 设置主音量 (0.0 - 1.0) |
| `toggleMute()` | 静音/取消静音切换 |
| `resume()` / `suspend()` | 恢复/挂起上下文（暂停状态机、标签页切换） |
| `tick(deltaTime)` | 每帧滤镜插值 + 临时低通计时（在动画循环中调用） |
| `dispose()` | 拆除全部节点并关闭上下文 |
| `enabled` (getter) | 上下文是否已就绪 |

### 一次性音效 (One-Shot SFX)

| 方法 | 波形 | 频率特征 | 描述 |
| :--- | :--- | :--- | :--- |
| `playFootstep()` | 方波 | 80-120Hz | 脚步咔哒，节流 0.25s |
| `playCablePulse()` | 方波 | 1200-1700→600Hz | 电缆脉冲滴答 |
| `playEyeBlink()` | 正弦 | 400→100Hz | 天眼眨眼降调（也用于日蚀） |
| `playDayNightTransition(toNight)` | 三角波 | 100↔800Hz | 昼夜交替扫描音 |
| `playJump()` / `playDoubleJump()` | 方波 / 方波+正弦 | 150→300 / 250→500+400→600Hz | 跳跃 8-bit 升调 / 双音连奏 |
| `playGazeStartPulse()` | 正弦 | 200→80Hz | 凝视开始低频脉冲 |
| `playInfoChirp(flowerIntensity?)` | 方波 | 2000-10000Hz | 数据啁啾，音量随花强度 0.02-0.06 |
| `playOverrideTear()` | 白噪声 | 带通 2000Hz | 反抗成功撕裂，0.3s |
| `playOverrideDeniedThud()` | 正弦 | 70→36Hz | 反抗被拒闷响（极轻，0.07） |
| `playDistantTear(proximity)` | 白噪声 | 低通 900Hz | 远处剪影的撕裂，音量 0.03-0.12 |
| `playRoomTransition()` | 白噪声+锯齿 | 带通 1500Hz + 800→150Hz | 房间切换双层跃迁音 (~400ms) |
| `playGlitchBurst()` | 方波 | 2000-6000Hz | 信号故障爆发 (0.6-1.0s) |
| `playFlowerStateChange(ascending)` | 正弦 | 400→600 / 600→450Hz | 花状态边界确认音 |
| `playFlowerChangeTone(intensity)` | 正弦 | 150-500Hz | 花调整确认音（事件驱动，防抖 0.09s） |
| `playRiftFall()` / `stopRiftFall()` | 噪声+锯齿 | 400→2000 + 200→50Hz | 裂缝坠落（持续，至重生/离开） |
| `playRiftRespawn()` | 正弦 | 50→800Hz | 重生反向吸入音 |

### 持续/动态效果

| 方法 | 描述 |
| :--- | :--- |
| `updateGaze(isGazing, intensity)` | 更新凝视低通目标 + 喂给 POLARIZED 节拍调度器 |
| `duckForSnapshot()` | 结算时临时低通 700Hz × 3s（复用凝视滤镜管线） |
| `updateSunsetForeshadow(level)` | 日落预兆低鸣下滑（0-1，每帧调用、内部去抖） |
| `onRoomChange(prev, new, audioConfig)` | 切换音 + 防抖重配置低鸣/噪声床/节拍层 |
| `startBinauralBeat(baseFreq?, beatFreq?)` / `stopBinauralBeat()` | 双耳节拍启停（默认 55/20Hz；房间切换自动管理） |
| `updateBinauralPosition(sideOffsetX, riftDistance)` | 语义轴偏移→失谐方向；裂缝距离→响度 |
| `updateWeatherAudio(type, intensity, onset?)` | 每帧天气层驱动（0 CLEAR / 1 STATIC / 2 RAIN / 3 GLITCH） |
| `updateFlowerAudio(intensity)` | 花状态边界检测 + 被注视低鸣 |
| `stopFlowerAudio()` | 重置花音效状态计数器（不拆节点） |
| `startCableHum()` / `updateCableHum(intensity)` / `stopCableHum()` | 电缆嗡鸣启停与强度 |
| `startRiftFog()` / `updateRiftFog(intensity)` / `stopRiftFog()` | 裂缝迷雾启停与接近度 |

---

## 触发条件汇总

| 音效 | 触发条件（调用方） |
| :--- | :--- |
| 脚步声 | 地面移动时（PlayerManager） |
| 一段跳 / 二段跳 | Controls 跳跃回调（PlayerManager） |
| 天眼眨眼 | 眨眼率 (0.06+花×0.24)/s ×(1−凝视)×风暴系数（SkyEye） |
| 昼夜交替 | 日落/日出（DayNightCycle） |
| 日蚀 | 白天 0.03/s 概率：眨眼音 + 强制 GLITCH 天气（DayNightCycle） |
| 凝视脉冲 | 开始凝视天眼（PlayerManager 回调） |
| 凝视低通 | 每帧随凝视强度（PlayerManager → AudioEngine） |
| 反抗撕裂 | POLARIZED 凝视中长按成功（PlayerManager 回调） |
| 反抗被拒闷响 | POLARIZED 未凝视按键；错误房间静默（PlayerManager） |
| 远处撕裂 | 剪影反叛事件，~150-360s 一次、30-60m 距离带（FigureSystem） |
| 信息啁啾 | INFO_OVERFLOW 内概率触发，率与音量随花强度（RoomFlowUpdater） |
| 房间切换音 | 跨房间边界，冷却 1.8s（RoomFlowUpdater → onRoomChange） |
| 低鸣重调音 / 噪声床 | 房间切换防抖 250ms 后（onRoomChange） |
| 双耳节拍 | 进入 FORCED_ALIGNMENT 持续；RiftMechanic 每帧驱动选边与响度 |
| POLARIZED 节拍 | 进入 POLARIZED 持续；凝视加速节拍 |
| 裂缝迷雾 | FORCED_ALIGNMENT 内持续，音量随距最近裂缝 40m 内渐强（RiftMechanic） |
| 裂缝坠落 / 重生 | 落入裂缝 / 坠落重置（RiftMechanic） |
| 电缆嗡鸣 | <8m 启动、>12m 停止（CableAudioUpdater） |
| 电缆脉冲 | <5m 每次检测 2.5% 概率、冷却 2.5s（CableAudioUpdater） |
| 天气层 | 每帧 `updateWeatherAudio(type, intensity, onset)`（main.ts） |
| 花状态确认 | 花强度跨越 0.3 / 0.7 边界（updateFlowerAudio） |
| 花调整确认音 | 滚轮 / Q-E / 触屏调整输入（PlayerManager 回调，事件驱动） |
| 被注视低鸣 | 花强度 >0.6 持续淡入（updateFlowerAudio） |
| 日落预兆下滑 | 日落前 30s 每帧（StatsSunsetUpdater） |
| 结算低通 | 日落快照落下时一次，700Hz × 3s（StatsSunsetUpdater） |
| 整体挂起/恢复 | ESC 暂停、标签页隐藏/可见（PauseController） |

**确认无音频钩子的系统**: `GhostSystem`（幽灵重放，注释明示 "No HUD, no audio"）、`ScarField`（疤痕场，纯视觉）。

---

## 控制台测试代码

`main.ts` 把应用实例挂在 `window.app` 上；`audio` 是 TypeScript 私有字段，编译后是普通属性，**运行时可从控制台访问**（仅供调试，不属于类型化 API）。先点击页面进入游戏一次（或手动 `init()`）以满足自动播放策略。

```javascript
// 初始化（须在用户手势后；进入游戏时 PauseController 已自动调用）
window.app.audio.init();

// === 一次性音效 ===
window.app.audio.playFootstep();              // 脚步 (80-120Hz 方波)
window.app.audio.playEyeBlink();              // 天眼眨眼
window.app.audio.playDayNightTransition(true);  // 日落扫描音
window.app.audio.playOverrideTear();          // 反抗撕裂
window.app.audio.playOverrideDeniedThud();    // 反抗被拒闷响
window.app.audio.playDistantTear(1.0);        // 远处撕裂（最近距离）
window.app.audio.playInfoChirp(0.8);          // 数据啁啾（亮花音量）
window.app.audio.playFlowerChangeTone(0.7);   // 花调整确认音
window.app.audio.playRiftFall();              // 裂缝坠落（持续）
window.app.audio.playRiftRespawn();           // 重生（并停止坠落）

// === 音量 ===
window.app.audio.setVolume(0.5);
window.app.audio.toggleMute();

// === 双耳节拍（手动启停 + 位置驱动） ===
window.app.audio.startBinauralBeat(55, 20);
window.app.audio.updateBinauralPosition(80, 0);   // 最右侧 + 站在裂缝上：响且不谐和
window.app.audio.updateBinauralPosition(-80, 0);  // 最左侧：响且谐和
window.app.audio.stopBinauralBeat();

// === 天气（type, intensity, onset） ===
window.app.audio.updateWeatherAudio(1, 0.8, 1);  // STATIC 扫描风暴（带开场涌起）
window.app.audio.updateWeatherAudio(2, 1.0, 0);  // RAIN 倾盆数据雨（最密 tick + 嘶声层）
window.app.audio.updateWeatherAudio(3, 0.8, 1);  // GLITCH 雷暴（开场 burst + 稀疏 snap）
window.app.audio.updateWeatherAudio(0, 0, 0);    // CLEAR 停止所有天气音效

// === 日落结算 ===
window.app.audio.duckForSnapshot();           // 700Hz 低通压 3 秒
```
