# 1-bit Chimera Void - 声音系统文档

## 概览 (Overview)

**1-bit Chimera Void** 的声音系统是一个基于 **Web Audio API** 构建的纯**程序化音频引擎**。它不依赖任何外部音频文件（如 mp3/wav），而是通过代码实时生成所有的声波。

这种设计通过创造一种**粗糙、数字、二进制**的听觉体验，完美契合了项目的 "1-bit" 视觉美学。

- **文件路径**: `src/audio/AudioController.ts`（业务逻辑）、`src/audio/AudioEngine.ts`（Web Audio 底层引擎）
- **核心技术**: `window.AudioContext`
- **设计哲学**: 极简主义、数字噪声、频率调制。

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

---

## 声音层级 (Sound Layers)

整体声景由四个截然不同的层级组成：

### 1. 环境氛围 (Ambient Atmosphere) —— "低鸣 (The Drone)"

一种持续的、令人不安的背景噪音，定义了虚空的基调。

*   **构成**: 两个以极低频率（约 35Hz）播放的"锯齿波 (Sawtooth)"振荡器。
*   **双耳失谐**: 两个频率有微小的偏差（35.0Hz vs 35.5Hz），产生自然的干涉模式或随时间演变的"拍频 (Beating)"效果。
*   **处理**: 通过低通滤波器 (200Hz) 去除高频的刺耳感，只保留深沉、共鸣的数字嗡嗡声。

### 2. 凝视滤镜 (The Gaze Filter) —— "动态沉浸"

一个将音频与玩家行为紧密耦合的独特机制。

*   **机制**: 应用于主输出通道的全局低通滤波器。
*   **正常状态**: 滤波器完全打开 (20,000Hz)，允许所有声音清晰通过。
*   **凝视状态**: 当玩家抬头直视**天眼 (Sky Eye)**时，滤波器截止频率急剧下降至约 400Hz。
*   **效果**: 世界的声音变得"发闷"或如同潜入水中，在直视实体时制造出一种心理上的压迫感和隔离感。

### 3. 房间特定音效 (Room-Specific Audio)

针对特定的程序生成房间类型的动态音频。

#### 强制对齐 (Forced Alignment) - 双耳节拍
*   **房间**: `FORCED_ALIGNMENT`
*   **技术**: 左耳播放 55Hz 正弦波，右耳播放 75Hz 正弦波。
*   **心理声学效果**: 大脑会感知到第三种"幻听"频率（20Hz β波），通常与专注或焦虑相关。
*   **空间动态**: 效果强度随着玩家靠近房间中心的"裂缝"而增加，暗示着危险的高强度数据同步。

#### 信息溢出 (Info Overflow) - 数据噪声
*   **房间**: `INFO_OVERFLOW`
*   **技术**: 随机触发高频方波脉冲 (2000-10000Hz)。
*   **效果**: 模拟数据过载、老式调制解调器或大型机的噪声。


#### 裂缝 (The Rift) - 虚空迷雾
*   **房间**: `FORCED_ALIGNMENT`
*   **技术**: 白噪声 (White Noise) + LFO 低通滤波器扫描 + 距离衰减。
*   **心理声学效果**: 类似于巨大的风洞或呼吸的迷雾，只有在靠近危险边缘时才会被听到。
*   **交互**: 掉入裂缝时触发 Shepard Tone 风格的无限下坠音效，重生时播放反向吸入声。

### 4. 天气音效 (Weather Audio)

根据程序生成的天气状态播放对应的环境音。每种天气占据**完全不同的频率范围**以确保可辨识性：

| 天气类型 | 频率范围 | 音效特征 | 持续时间 | 独特听感 |
| :--- | :--- | :--- | :--- | :--- |
| **CLEAR** | — | 无 | — | 安静 |
| **STATIC** | 40-100Hz (极低频) | LFO 调制的三角波 drone + 泛音 | 持续循环 | 深沉的"呼吸"震动 |
| **RAIN** | 300-1200Hz (中频) | 下降的纯正弦音阶滑音 | 400ms/音符，500ms 间隔 | 旋律性的"数据滴落" |
| **GLITCH** | 2000-6000Hz (高频) | 随机静默间隙的方波爆发 | 600-1000ms 总长 | 卡顿/数字故障 |

---

## API 完整方法列表

### 初始化与控制

| 方法 | 描述 |
| :--- | :--- |
| `init()` | 初始化音频上下文（必须在用户交互后调用） |
| `setVolume(value: number)` | 设置主音量 (0.0 - 1.0) |
| `toggleMute()` | 静音/取消静音切换 |

### 一次性音效 (One-Shot SFX)

| 方法 | 波形 | 频率特征 | 描述 |
| :--- | :--- | :--- | :--- |
| `playFootstep()` | 方波 | 80-120Hz | 粗糙、急促的"咔哒"声，类似机械开关 |
| `playCablePulse()` | 方波 | 1200→600Hz | 电缆脉冲，高频滴答声 |
| `playEyeBlink()` | 正弦波 | 400→100Hz | 天眼眨眼，降调扫描音 |
| `playDayNightTransition(toNight)` | 三角波 | 100↔800Hz | 昼夜交替扫描音 |
| `playOverrideTear()` | 白噪声 | 带通2000Hz | 覆盖/撕裂，静电爆发 |
| `playInfoChirp()` | 方波 | 2000-10000Hz | 信息溢出，高频数据脉冲 |
| `playGazeStartPulse()` | 正弦波 | 200→80Hz | 凝视开始时的低频脉冲 |
| `playRoomTransition()` | 白噪声+锯齿波 | 3000→400Hz + 800→150Hz | 房间切换，双层数字跃迁音 (~400ms) |
| `playJump()` | 方波 | 150→300Hz | 一段跳，8-bit 风格升调 |
| `playDoubleJump()` | 方波+正弦 | 250→500Hz + 400→600Hz | 二段跳，双音符急促连奏 |
| `playGlitchBurst()` | 方波 | 2000-6000Hz | 信号故障卡顿爆发 (600-1000ms) |
| `playFlowerStateChange(ascending)` | 正弦波 | 400→600Hz / 600→450Hz | 花状态边界跨越确认音 (纯五度/四度) |

### 持续/动态效果

| 方法 | 描述 |
| :--- | :--- |
| `updateGaze(isGazing, intensity)` | 更新凝视低通滤镜状态 |
| `tick(deltaTime)` | 每帧平滑滤镜插值（需要在动画循环中调用） |
| `startBinauralBeat(baseFreq, beatFreq)` | 启动双耳节拍 (FORCED_ALIGNMENT 房间) |
| `stopBinauralBeat()` | 停止双耳节拍 |
| `updateBinauralPosition(xPosition, crackWidth)` | 根据玩家位置更新双耳节拍强度 |
| `updateWeatherAudio(weatherType, intensity)` | 更新天气音效状态 |
| `updateFlowerAudio(intensity)` | 更新花强度音效 (150-500Hz 纯正弦，柔和淡入，仅变化时播放) |
| `stopFlowerAudio()` | 重置花音效状态 |

---

## 触发条件汇总

| 音效 | 触发条件 |
| :--- | :--- |
| 脚步声 | 玩家在地面移动时 |
| 天眼眨眼 | 天眼随机眨眼时 (~0.1% 概率/帧) |
| 昼夜交替 | 日落或日出时 |
| 覆盖撕裂 | 玩家在 POLARIZED 房间激活 Override 时 |
| 信息溢出 | 玩家在 INFO_OVERFLOW 房间时 (~2% 概率/帧) |
| 凝视脉冲 | 玩家开始凝视天眼时 |
| 房间切换 | 玩家跨越房间边界时 |
| 一段跳 | 玩家从地面起跳时 |
| 二段跳 | 玩家在空中二次起跳时 |
| 双耳节拍 | 玩家进入 FORCED_ALIGNMENT 房间时持续播放 |
| 静态雪花音 | 天气为 STATIC 时持续播放 |
| 数字雨音 | 天气为 RAIN 时持续播放 |
| 信号故障音 | 天气为 GLITCH 时触发 |
| 花强度音 | 花强度变化时播放微音（稳定时静音） |
| 花状态确认 | 花强度跨越 0.3 或 0.7 边界时播放纯五度/四度音程 |
| 裂缝迷雾 | 在 `FORCED_ALIGNMENT` 房间靠近裂缝时 |
| 裂缝坠落 | 掉入裂缝时触发 (Shepard 下坠音) |
| 裂缝重生 | 坠落重置时触发 (反向吸入音) |
| 电缆嗡嗡 | 靠近电缆 (8m内) 时触发 (100Hz Sawtooth + LFO) |
| 电缆火花 | 极近距离 (<2.5m) 随机触发 (High Pitch Pulse) |

---

## 控制台测试代码

```javascript
// 初始化（必须先点击页面一次，或手动调用）
window.app.audio?.init();

// === 一次性音效测试 ===
window.app.audio?.playFootstep();         // 脚步声 (80-120Hz 方波)
window.app.audio?.playCablePulse();       // 电缆脉冲 (1200->600Hz)
window.app.audio?.playEyeBlink();         // 天眼眨眼 (400->100Hz)
window.app.audio?.playDayNightTransition(true);   // 日落 (扫描音)
window.app.audio?.playDayNightTransition(false);  // 日出 (扫描音)
window.app.audio?.playOverrideTear();     // 覆盖撕裂 (白噪声爆发)
window.app.audio?.playInfoChirp();        // 信息溢出 (高频数据音)
window.app.audio?.playGazeStartPulse();   // 凝视开始 (低频脉冲)
window.app.audio?.playRoomTransition();   // 房间切换 (噪声+扫描)
window.app.audio?.playJump();             // 跳跃 (150->300Hz)
window.app.audio?.playDoubleJump();       // 二段跳 (双音连奏)
window.app.audio?.playGlitchBurst();      // 信号故障 (随机跳变)

// === 音量控制 ===
window.app.audio?.setVolume(0.5);   // 设置音量 50%
window.app.audio?.toggleMute();      // 静音切换

// === 双耳节拍 (需要手动启停) ===
window.app.audio?.startBinauralBeat(55, 20);  // 启动
window.app.audio?.stopBinauralBeat();          // 停止

// === 天气音效测试 ===
window.app.audio?.updateWeatherAudio(1, 0.8);  // 静态雪花 (STATIC) - 低频 drone (40-100Hz)
window.app.audio?.updateWeatherAudio(2, 0.8);  // 数字雨 (RAIN) - 中频旋律滑音 (300-1200Hz)
window.app.audio?.playGlitchBurst();           // 信号故障 (GLITCH) - 高频卡顿爆发 (2-6kHz)
window.app.audio?.updateWeatherAudio(0, 0);    // 晴朗 (CLEAR) - 停止所有天气音效
```
