# 1bit（One Bite）体验流程评审报告

> 跨维度去重说明：8 个维度共 38 条核实保留的发现，去重合并后为 **9 条高优先级断裂、9 条中低优先级断裂、15 项可加强项**。重复最多的是"反抗提示一帧"（3 个维度报过）、"房间边界 40m 错位"（3 条发现同根因）、"昼夜墙钟"（2 条）、"SkyEye 零感知"（2 条）、"溢出负反馈"（2 条）。
> 证据路径统一省略前缀 `/Users/aaajiao/Documents/1bit/`。

---

## 总评

当前实现的病灶不在设计、也不在系统，而在**接线**：状态计算层是健康的——`gazeIntensity`、`flowerIntensity`、`overrideSuccesses`、房间类型、行为统计全都在被正确计算——但通往玩家感官的最后一公里大面积断线。具体断在四个环节：

1. **视觉反馈环节**："压抑"的体验半边失声。凝视不进 shader（承诺的 uContrast 1.0→1.8 不存在）、花的亮度不进世界也不进眼睛（"调亮有代价"零实现）、三个房间的核心视觉机制（FA 选边不对称、INFO 溢出负反馈、POLARIZED 纯净性）要么未接线、要么方向相反、要么被解耦的天气打破。值得注意：对抗核实推翻了"天眼看不见"的指控——眼在俯仰约 26° 即入画且永不被遮挡，**"看见权威"成立，缺的是权威的回看和屏幕的回应**。
2. **操作反馈环节**：玩家的输入经常掉进无回应的黑洞。菜单明示的 SHIFT 在绝大多数情境静默拒绝、唯一的情境化反抗提示只渲染一帧、滚轮调光的确认音因阈值数学在 ≥30fps 下永不发声、触屏设备要么进不去要么走不动。
3. **空间基准**：房间逻辑判定与可见几何恒定错位 40 米，使所有已正确实现的房间反馈都在错误的地点触发，并制造"凌空走深渊/穿透完好地板"的物理荒谬。
4. **时间基准**：run 边界挂在页面墙钟上，第四阶段的结算快照可以在开场数秒误弹（空 run），也可以被一次切标签页整段吞掉。

绝大多数修复的形态是同一句话：**把 main.ts 里已经持有的状态，传进已经存在的系统**。

---

## 【高优先级断裂】（按对叙事弧线的伤害排序）

### 1. 凝视的屏幕反馈整体缺失：uContrast 1.0→1.8 未接线
*合并自 gaze-loop（high）+ session-flow（medium）*

- **玩家会经历什么**：抬头看天眼，花变暗（且常被手部动画移出视野）、声音渐闷——但**屏幕本身纹丝不动**。默认花强度 0.5 的玩家越过 45° 阈值的瞬间，强制值恰好也是 0.5，视觉变化为零；静音玩家（网页场景极常见）几乎得不到任何反馈。第二阶段"被规训"的学习无法发生，下游一切因果归因（包括反抗条件的发现）都被拖累。
- **设计本意**：docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:66 承诺凝视时 uContrast 1.0→1.8"使图像更刺眼"；:43"看向眼睛，屏幕对比度会变硬"；:1052 无障碍承诺"注视=对比度变化"。
- **证据**：`src/core/ShaderUniformUpdater.ts:75-120`（:96 uContrast 只读房间配置）；`src/main.ts:345-353`（调用处不传 gazeIntensity）；`src/shaders/DitherShader.ts:205,269`（全 shader 无 gaze uniform，间接影响仅 ≤0.04 阈值偏移）；`src/player/GazeMechanic.ts:184`。
- **建议补法**：`updateShaderUniforms` 加 `gazeIntensity` 参数，`u.uContrast.value = shaderConfig.uContrast + gazeIntensity * 0.8`（POLARIZED 基准已 2.0，需 clamp）。复用现成 intensity 曲线，进出自动平滑。同一管线顺手做 45° 白线（见可加强项 #2）。

### 2. 反抗机制入口双重失效：提示只活一帧 + 无效输入零反馈
*合并自 onboarding（high+medium）+ override-loop（high+medium）+ session-flow（high），共 5 条发现*

- **玩家会经历什么**：开场菜单看到"[SHIFT] 反抗"→ 出生即按 → 零反应（出生地是 INFO_OVERFLOW，机制限定 POLARIZED+凝视中），结论是"这键没做完"；真正辛苦满足触发条件后，提示"[SHIFT] 也许可以反抗"在屏幕上只存在约 16ms（一帧），且 `reset()` 刻意保留 `hasBeenShown`，本会话永不再现；成功一次后在 3 秒冷却内重按，得到与成功前完全相同的零响应——**规则不可学习**。设计的戏剧高潮几乎只能靠菜单文字+盲试抵达。
- **设计本意**：docs ZH:767-777——条件满足后建筑表面叙事性闪烁 [HOLD TO RESIST]，是无教程哲学下反抗的情境化引导通道；体验逻辑要求被明示的操作在无效时也有"此处不可用"级反馈。
- **证据**：`src/main.ts:403-410`（shouldShow 为 true 的同帧立即 markOverrideHintShown）；`src/player/OverrideMechanic.ts:227-242,295`（hasBeenShown 永久化）、`:71,163-214`（条件不满足直接走 else，零回调）；`src/ui/HUD.ts:45-47`；`index.html:20`；`src/shaders/DitherShader.ts:314-321`（边缘脉冲通道已存在可复用）。
- **建议补法**：① 提示加显示计时器——shouldShow 首次为 true 后保持 visible 8-12s（或直到成功触发一次）再 markHintShown；注意 `tests/OverrideMechanic.test.ts:250` 固化了机制层行为，改 main.ts 接线层即可。② 失败反馈分级：冷却中→边缘脉冲以低强度显示剩余冷却（复用 uOverrideProgress）；POLARIZED 但未凝视→极轻低频 thud；非 POLARIZED→保持沉默（符合"只有这里能反抗"）。中期按设计改 diegetic 建筑表面文字。

### 3. 房间状态边界与可见几何错位 40 米，裂缝坐在状态格边线上
*合并自 room-transitions（2 条 high）+ room-visual-language（high），同根因*

- **玩家会经历什么**：踩上肉眼可见的新地板（青色字形→紫色摩尔纹的接缝）后，调色板、音频、机制**5-7 秒纹丝不动**，走到新地块视觉中心才突变；反方向行走则人还在旧地板上世界先变了。更糟的是裂缝：从西侧接近 FORCED_ALIGNMENT 时，10 米雾声铺垫全部缺失，玩家先在可见深渊上"踩空气"走 2 米，跨过中心线的**同一帧无预警坠落**；在状态格东半部还会穿透看似完好无裂缝的地板坠落。相邻 chunk 约 75% 概率不同房间，这种错位接缝非常密集。
- **设计本意**：房间是"精神状态空间"，踏上地面时视听机制应同步切换；裂缝承诺"20m 可见 + 10m 雾声渐强 → 主动选择跨越或坠落"。
- **证据**：`src/world/ChunkManager.ts:135`（几何居中 cx*80，footprint [k*80-40, k*80+40]）、`:785-800`（Math.floor 判定 [k*80, k*80+80)）、`:226-227`；`src/world/FloorTile.ts:57-64`；`src/world/RiftMechanic.ts:18-44`（自己用 Math.round，两套约定并存）；`src/main.ts:297-299`；`src/config/physics.ts:32`。
- **建议补法**：`updatePlayerRoom` 的 `Math.floor` 改 `Math.round`（与 RiftMechanic 对齐），逻辑格与几何 footprint 重合，裂缝自动回到房间中心、双侧铺垫恢复；RiftMechanic 增加校验（round 后的 chunk 确属 FORCED_ALIGNMENT 且 z 在 footprint 内）才设 groundLevel=-1000；补一个 tests/ 纯逻辑测试断言边界两侧归属。**这是后续所有房间级反馈修复的空间基准，应最先做。**

### 4. 天空之眼对玩家状态零感知：花调亮无代价，被注视无回应
*合并自 flower-feedback（high）+ gaze-loop（medium），同一接线缺口*

- **玩家会经历什么**：把花拉满 1.0——眼不会更频繁注视、不会逼近、没有威胁音，全游戏范围零负反馈，"美丽但危险"只存在于文案，欲望-风险经济只有"凝视压花"单向；反过来盯着眼看 10 秒与背对它走路，眼的行为完全相同（眨眼是 `Math.random() > 0.999` 纯随机）。权威是一场单向哑剧。
- **设计本意**：docs ZH:16"把它调得太亮会吸引眼睛的注视"、:24"必须调暗内心的花"——顺从/表达权衡的根基；凝视叙事是"你看它、它看你"的相互规训。`FlowerProp.ts:199` 注释自己写着 0.3-0.7 "starts attracting attention"，但 attention 无任何实现。
- **证据**：`src/world/SkyEye.ts:114`（update 签名不收花/凝视）、`:136`（纯随机眨眼，triggerBlink 无外部调用方）、`:124-133`；`src/main.ts:359-360`（playerState.isGazing 同作用域可用却没传）；`src/player/GazeMechanic.ts:87-98`（只判 pitch，无任何"眼知道被看"的通路）。
- **建议补法**：`SkyEye.update` 加两个参数（main.ts 现成状态直传）：花强度高时→提高眨眼概率、收紧跟随 lerp/maxLag（眼贴得更近）、放大瞳孔追踪增益，AudioController 加随花强度的低频"被注视"嗡鸣；被凝视时→瞳孔收拢放大、压制眨眼（对峙感）、环转速 ×1.5-2。全是现有字段的小改动，无需新几何体。

### 5. 昼夜挂墙钟：结算快照在开场误弹、或被整段吞掉
*合并自 ending-snapshot（high）+ session-flow（medium）*

- **玩家会经历什么**：在开始界面停留 150-300s（读说明/后台标签页）后点击进入，第一个未暂停帧就触发 day→night，数秒内弹出一份"空 run"快照，文本说"大多把视线放在地上"——玩家从未做过的行为，与"非评判性总结"直接矛盾；或者 ESC/切页跨过整个夜晚，该 run 的日落结算被静默跳过，两个 run 的数据混在一起。行为统计按游玩时间累积、run 边界却按墙钟，同项目两套时钟（WeatherSystem 是 delta 驱动的）互相矛盾。
- **设计本意**：第四阶段"解决"——运行结束后收到对**本次运行**心理选择的总结；run 的"一天"应对应实际游玩时间。
- **证据**：`src/main.ts:242,252`（t=墙钟）、`:256-259`（暂停只 return 不冻结 t）、`:330-338`；`src/world/DayNightCycle.ts:39-49`；`src/stats/RunStatsCollector.ts:201-204`（samples=0 时必产出 MEDIUM_LIGHT+LOW_GAZE）；`src/stats/StateSnapshotGenerator.ts:136-157`。
- **建议补法**：DayNightCycle 维护暂停感知的累积时钟（未暂停分支 +=delta），开始界面/暂停时间不计入白天；onSunset 前加最小 run 时长门槛（如 <30s 跳过快照）双保险。**这是结算层一切修复的时间基准。**

### 6. 单次成功反抗进不了日落快照："被世界记住"的承诺落空

- **玩家会经历什么**：完成全游戏最戏剧性的动作 1-3 次，日落快照对此一字不提。RESISTER 条件是按住时长占 run 的 5%——首个 run（150s）需累计 6-9 秒，后续 run（日落到日落全周期 240-360s）需 **12-18 秒**，而典型一次成功只有 1-1.5s；`overrideSuccesses` 被逐次采集却零消费。视觉效果 0.5s 后彻底归零，世界内也无任何残留。
- **设计本意**：RESISTER 文案"**有一次**把画面弄坏了，它后来恢复了，但已经不太一样"——语义就是一次即应被记住，且文本优先级排第一（"Resistance is most notable"）。
- **证据**：`src/stats/RunStatsCollector.ts:270-272`（overrideRatio>0.05）、`:205`（overrideSuccesses 只写不读）；`src/stats/StateSnapshotGenerator.ts:68-71,136-137`。
- **建议补法**：一行——`s.overrideSuccesses >= 1 || overrideRatio > 0.05`。本报告性价比最高的修复，建议第一批提交。

### 7. FORCED_ALIGNMENT 的"选边"机制视觉与听觉双盲

- **玩家会经历什么**：站在裂缝左侧和右侧，画面**完全相同**（uNoiseDensity 全屏单一标量 0.55，shader 无任何分侧分支，建筑两侧对称生成），声音也**完全相同**（双耳节拍用 `Math.abs(x)` 只感知离裂缝远近，左右对称）。该房间的核心心理机制——"完全移向一侧会使世界更连贯"的选边代价——不可发现。
- **设计本意**：左侧整洁低抖动 ~0.4、右侧破碎高抖动 ~0.7（docs ZH:591-593, 606-608），配左协和/右不协和的分侧音频。
- **证据**：`src/world/RoomConfig.ts:107`；`src/shaders/DitherShader.ts:243-249`；`src/world/RoomGeneration.ts:66-70`；`src/audio/AudioController.ts:603-611`（abs 对称）。
- **建议补法**：最小方案——房间为 FA 时按玩家相对裂缝中心的**有符号**距离把 uNoiseDensity 在 0.4↔0.7 间插值（依赖断裂 #3 的 round 修复确定裂缝中心）；进阶——uCrackScreenX 屏幕分侧 + 按 bx 符号偏置建筑风格 + 分侧谐波。

### 8. INFO_OVERFLOW 的溢出负反馈：视觉半边是死代码且方向相反，听觉半边恒定
*合并自 flower-feedback（high+medium）+ room-visual-language（medium），同一闭环*

- **玩家会经历什么**：在最该学会"更多输入≠更多理解"的房间把花拉满——噪声密度纹丝不动（INFO_OVERFLOW_NOISE_MAP 定义后**全仓零引用**），uTemporalJitter 恒 0.6 永远到不了承诺的 0.9，shader 里唯一的花强度项 `threshold -= (uFlowerIntensity-0.5)*0.1` 让画面**越亮越白越"干净"——与房间教训方向相反**；啁啾声概率恒 0.02、音量恒 0.03、不收任何参数，花在 0.1 和 1.0 时听觉密度完全相同。唯一活着的耦合是建筑闪烁加速（6s→1.5s），形成视觉加快、听觉无动于衷的感官自相矛盾。
- **设计本意**：docs ZH:552-558 noiseDensity 0.75→1.0 映射；EN:77 uTemporalJitter 0.2→0.9；ZH:79,545"哔哔声频率和强度随花朵亮度增加"。
- **证据**：`src/world/RoomConfig.ts:198-204`（死代码）；`src/core/ShaderUniformUpdater.ts:93-95`；`src/shaders/DitherShader.ts:269`；`src/main.ts:300-308`；`src/audio/AudioController.ts:261-269`；`src/world/ChunkAnimator.ts:82`（活的那一半）。
- **建议补法**：房间为 INFO_OVERFLOW 时用 NOISE_MAP 插值覆盖 uNoiseDensity、uTemporalJitter 随强度上抬（0.3+intensity*0.6）、threshold 花强度项在该房间反向或归零；啁啾概率乘 `(0.5+intensity*1.5)`、playInfoChirp 加 intensity 参数调音量（0.02→0.06）——playerState 在调用处同作用域已可用。

### 9. 触屏设备：Android 进不去，iPad 进得去但永远走不动

- **玩家会经历什么**：Android Chrome 上 `requestPointerLock` 存在但调用是静默 no-op，isLocked 永远 false、main.ts 永久 paused——点"点击进入嵌合体废墟"毫无反应，像坏了；iPad（WebKit 不暴露该 API，fallback 正确生效）能进入、能触摸转视角，但触摸事件只实现了 look，没有任何移动/跳跃/调花输入，玩家被钉在出生点。只有 iPad+Magic Keyboard 体验完整。
- **设计本意**：Controls.ts 注释明确把触屏列为支持平台；体验底线是至少能进入并移动，或得到明确的"不支持"信号。
- **证据**：`src/player/Controls.ts:82`（检测方式对 Android 误判）、`:249-252`、`:267-349`（触摸仅 look）；`src/main.ts:203-206`；`index.html:16-20`（只列键盘）。
- **建议补法**：用 `matchMedia('(pointer: coarse)')` 判定触屏；加最小触屏移动（虚拟摇杆或按住屏幕前进）；或在入口检测后显示"需要键盘鼠标"，杜绝点了没反应的死入口。

---

## 【中低优先级断裂】

| # | 断裂 | 玩家感知 | 证据 | 补法方向 |
|---|------|----------|------|----------|
| 1 | 浅凝视反向把暗花拉亮 | 谨慎玩家（花<0.3）被"规训"反而获得更多光；规训方向自相矛盾 | `src/player/GazeMechanic.ts:184`、`src/player/FlowerProp.ts:215-217` | 强制值与玩家 targetIntensity 取 min（只压不抬）；起始强制值降至 ~0.35 |
| 2 | POLARIZED 凝视音频强化连载体都不存在，且全局低通在该房间几乎不可闻（drone 全在 400Hz 截止之下）| 哲学高潮房反而是凝视反馈最弱的房间，与意图恰好相反 | `src/world/RoomConfig.ts:180-184`、`src/audio/AudioController.ts:107-109` | 加 440/880Hz 节拍层（参照 startRainAmbient 调度），凝视时间隔 ×1/(1+0.3·gazeIntensity) |
| 3 | 天气与房间解耦 | STATIC/GLITCH 满屏翻转打破 POLARIZED"零噪声"承诺；数字雨仅占 ~6-7% 时长且会落在任何房间 | `src/world/WeatherSystem.ts:59-131`、`src/main.ts:341` | WeatherSystem.update 传 roomType 做加权：INFO 提高 RAIN、POLARIZED 屏蔽 STATIC/RAIN |
| 4 | 过渡中途折返调色板单帧瞬跳 | 边界试探时画面向**刚离开的**房间方向 pop（早期折返跳变可达 ~87 个百分点）| `src/world/ChunkManager.ts:756-763,795-800` | 触发新过渡时把当前插值状态深拷贝冻结为 from 配置 |
| 5 | 过渡 whoosh 无冷却连发 | 沿边界横移每次跨缝完整触发，与自家 250ms 去抖意图矛盾 | `src/audio/AudioController.ts:281-297,817-842` | 加 1.5-2s 最小间隔（常量进 config/audio.ts） |
| 6 | 滚轮升调确认音永不触发 | 单次滚动（±0.1）在 ≥30fps 下永远静音，无教程下玩家无法确认滚轮生效 | `src/audio/AudioController.ts:488-506`、`src/player/FlowerProp.ts:221` | 改事件驱动：onFlowerIntensityChange 回调里直接 playFlowerChangeTone；silenceTimer 改 delta 秒计 |
| 7 | 每局固定出生最吵的 INFO_OVERFLOW | 第一分钟是全游戏最嘈杂体验，与第一阶段"安静觉醒"相反，且开场千篇一律 | `src/main.ts:113`、`src/world/RoomConfig.ts:290-301`、`src/world/ChunkManager.ts:87` | 出生点周边一圈固定安静房型，或启动时搜索最近 IN_BETWEEN/POLARIZED |
| 8 | 快照展示 setTimeout 墙钟 + 不可重看 | ESC/切页超过剩余窗口即永久错过一次性结算；#ui 与 overlay z-index 语义冲突 | `src/stats/SnapshotOverlay.ts:137-150`、`src/main.ts:224-235` | 改 update(delta) 驱动、暂停冻结；缓存最近快照供暂停界面重看 |
| 9 | 快照全屏 CPU 逐像素渲染 | 叙事高潮处每帧 ~13 万次求值 + 830 万字节写入，与渲染管线同帧竞争，易掉帧 + GC 压力 | `src/stats/SnapshotOverlay.ts:190-266` | 512×512 固定尺寸 + CSS 放大；或静态部分预烤离屏 canvas |

---

## 【可加强项】（enhancement，按性价比排序）

| # | 项 | 价值 / 成本 | 位置 |
|---|---|---|---|
| 1 | 花开场脉冲（0.3-0.5 正弦 10s）+ 60s 无交互 [scroll] 兜底 | 恢复"无教程"设计支柱第一环 / 很小 | `src/player/FlowerProp.ts:139-148` |
| 2 | 45° 白线 + 凝视暗角（uGazeIntensity）| 与高优 #1 同一管线**顺手做**，兑现无障碍承诺 / 增量极小 | `src/shaders/DitherShader.ts`、`src/core/ShaderUniformUpdater.ts` |
| 3 | 凝视结束后花延迟 2-3s 恢复 | 让玩家低头时看见"熄灭后的花"——核心规训画面目前发生在视野外 / 极小（方案 b）| `src/player/HandsModel.ts:304-312`、`src/player/FlowerProp.ts:215-221` |
| 4 | override 触发瞬间 raw bypass 0.1s（uRawBypass 输出未 dither 原始画面）| 反抗的核心心理 payoff："系统裂开"而非"抖了一下" / 中 | `src/shaders/DitherShader.ts:313-327` |
| 5 | override 按住期间边缘脉冲常亮 + 松键 0.2s 衰减 | 按住=持续对抗有了画面对应物 / 小 | `src/shaders/DitherShader.ts:314-321` |
| 6 | override 成功后留 run 内残差（uMisregister 每次 +0.01）| "恢复了但已不太一样"在当场成立 / 小 | `src/core/ShaderUniformUpdater.ts` |
| 7 | 低通改 log 域插值或 setTargetAtTime | "变闷"从 1.5s+ 收到承诺的 0.5s / 小 | `src/audio/AudioEngine.ts:152-158` |
| 8 | 日落前 30s 环境预告 + beforeunload 时快照存 localStorage、下次开始界面一行小字呈现 | 结束可被预感、数据不再无声丢失 / 中 | `src/main.ts:137,166`、`src/stats/RunStatsCollector.ts` |
| 9 | 快照仪式感：展示期钝化输入 2-3s + 音频低通收束 + 日落帧跳过 forceWeather | 与天气故障的视觉语言拉开距离 / 小 | `src/main.ts:330-338`、`src/world/DayNightCycle.ts:59-83` |
| 10 | 房间 2×2 chunk 区块聚类（160m 房间）| 边界重新成为"事件"，预告线索不再互相重叠 / 中（reproducibility contract 仅要求会话内确定性，seed 数学可自由改）| `src/world/RoomConfig.ts:290-301` |
| 11 | POLARIZED 身份补完：棋盘格地板 + FLUID/SPIKES 并入 BLOCKS + 天眼放大 1.6×/增环 | 哲学高潮三件套目前只到位一件 / 中 | `src/world/FloorTile.ts:392-430`、`src/world/RoomGeneration.ts:58-64`、`src/world/SkyEye.ts:62-97` |
| 12 | INFO_OVERFLOW 雾参数按房间插值（8/45）+ 远景溶解为噪声 | "30m 噪声地平线"的焦虑感 / 小 | `src/core/SceneSetup.ts:22` |
| 13 | 凝视方向点积校验（眼不入画时衰减 gazeIntensity）| 惩罚归因更清晰 / 小 | `src/player/GazeMechanic.ts:87-98` |
| 14 | IN_BETWEEN ghost 克隆在边界条带加密 | 兑现"边界边缘 Z-fighting"的预告语义 / 小 | `src/world/ChunkManager.ts:388-415` |
| 15 | pointer lock 冷却 catch+延迟重试、暂停态"已暂停—点击继续"文案、触屏退出路径 | 消除恢复路径的无声失败 / 小 | `src/player/Controls.ts:249-263`、`index.html:13-21` |

---

## 【建议的补足顺序】（workflow 实施建议）

**Step 1 — 双基准修复（其他一切的前置，两个子任务互相独立、可并行）**
- 1A 空间基准：`updatePlayerRoom` floor→round + RiftMechanic chunk/z 校验 + 边界归属纯逻辑测试（断裂 #3）。
- 1B 时间基准：DayNightCycle 暂停感知累积时钟 + 最小 run 时长门槛（断裂 #5）。
- 顺手带上一行修复：RESISTER `overrideSuccesses >= 1`（断裂 #6）。
- 依赖说明：Step 2/4 的房间级反馈必须落在正确地块上才有意义，Step 4 的结算修复依赖正确的 run 边界——所以这一步必须最先合入。

**Step 2 — 视觉反馈接线（围绕"状态→shader/世界"的同构改动，建议同一 worktree 内串行小步提交）**
- uGazeIntensity→uContrast（断裂 #1）+ 45° 白线/暗角（增强 #2）；SkyEye 接收花强度与凝视态（断裂 #4）；INFO_OVERFLOW noise map 激活 + jitter + threshold 反向 + 啁啾调制（断裂 #8）；FA 有符号距离 noiseDensity（断裂 #7，依赖 1A 的裂缝中心约定）；WeatherSystem 接 roomType（中表 #3）。
- 这些改动彼此功能独立，但**全部要改 main.ts 的调用签名**——不建议多 agent 并行改 main.ts，按文件串行最稳。

**Step 3 — 操作反馈闭环（与 Step 2 可并行，文件域基本不重叠：OverrideMechanic/HUD/AudioController/Controls）**
- 反抗提示显示计时器 + 失败反馈分级（断裂 #2，注意同步更新 tests/OverrideMechanic.test.ts）；滚轮确认音改事件驱动（中表 #6）；浅凝视单向 clamp（中表 #1）；触屏检测与最小输入或明确提示（断裂 #9）。
- 唯一与 Step 2 的接触点是 main.ts 的 resolveOverrideHint，注意合并顺序。

**Step 4 — 过渡与结算加固（依赖 Step 1 合入后开始）**
- 折返冻结 from 配置 + whoosh 冷却（中表 #4/#5）；SnapshotOverlay 改 delta 驱动 + 重看入口 + 512×512（中表 #8/#9）；出生房间控制（中表 #7）；POLARIZED 节拍层 + 凝视加快（中表 #2）。

**Step 5 — 氛围与打磨（完全独立，可随时并行插入）**
- 增强表 #1/#3/#4/#5/#6（开场引导 + 反抗 payoff 三件套）、#8/#9（结算仪式感）、#10/#11/#12（房间身份补完）、#7/#13/#14/#15。

每步收尾跑 `bun run typecheck && bun run test`；涉及 shader 的步骤（2、5）建议加一次 `bun run dev` 实机走查四个房间 + 一次完整日落，因为 shader 路径没有自动化测试覆盖。

---

## 附录：核实后的原始发现清单

- **[high/break] 覆盖提示只显示一帧（约16ms），玩家实际上永远看不到** (onboarding)
  - 证据: /Users/aaajiao/Documents/1bit/src/main.ts:403-410, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:227-242, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:295, /Users/aaajiao/Documents/1bit/src/ui/HUD.ts:45-47
  - 建议: 在 main.ts（或新建 src/ui/HintOverlay.ts 系统）给提示加显示计时器：shouldShow 触发后让 hint 保持 visible 若干秒（如 8-12s 或直到玩家成功触发一次 override）再 markHintShown()。更贴近设计的做法是把提示从 #coords 调试行移到独立的全屏低调 DOM 元素或建筑表面贴图（diegetic），并配淡入淡出。
- **[medium/break] 起始菜单宣布 [SHIFT] 反抗，但按下后在大多数情况下零反馈** (onboarding)
  - 证据: /Users/aaajiao/Documents/1bit/index.html:20, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:71, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:163-172, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:198-214, /Users/aaajiao/Documents/1bit/src/ui/HUD.ts:41
  - 建议: 两个方向择一：(1) 忠于无教程设计——从 index.html 起始菜单删去 [SHIFT] 行，完全交给修复后的情境提示；(2) 保留菜单项但补'无效反馈'——在 OverrideMechanic 增加 onOverrideRejected 回调，按下时给一个极轻的失败音/屏幕微颤（AudioController + DitherShader uOverrideProgress 已有管线可复用），暗示'此地/此刻不行'。
- **[medium/enhancement] 花朵首载脉冲与 60 秒 [scroll] 兜底提示均未实现，由起始菜单文字教程顶替** (onboarding)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/FlowerProp.ts:139-148, /Users/aaajiao/Documents/1bit/index.html:19, /Users/aaajiao/Documents/1bit/src/audio/AudioController.ts:471-491, /Users/aaajiao/Documents/1bit/src/world/ChunkAnimator.ts:82
  - 建议: 在 player/HandsModel.ts 或 FlowerProp.ts 加开场引导态：进入指针锁定后前 10 秒让 targetIntensity 在 0.3-0.5 间正弦摆动，玩家首次滚轮/Q/E 输入即退出引导态；在 main.ts 加一个简单的无交互计时（复用 paused 状态机），60s 无滚轮输入时经 HUD 或独立元素淡入 '[scroll]'。
- **[low/enhancement] 45° 俯仰角白线标记与首次越线脉冲未实现，凝视的视觉反馈偏弱** (onboarding)
  - 证据: /Users/aaajiao/Documents/1bit/src/core/ShaderUniformUpdater.ts:75-120, /Users/aaajiao/Documents/1bit/src/player/GazeMechanic.ts:105-126, /Users/aaajiao/Documents/1bit/src/player/PlayerManager.ts:70-72, /Users/aaajiao/Documents/1bit/src/ui/HUD.ts:42-47
  - 建议: 给 DitherShader 加 uGazeIntensity uniform（由 main.ts 经 updateShaderUniforms 传 playerState.gazeIntensity），凝视时轻微提升 uContrast 或加暗角，兑现'注视=对比度变化'；45° 白线可在同一 shader 里按相机 pitch 画一条屏幕空间细线，首次越线时调一次短脉冲动画。
- **[low/enhancement] Pointer lock 退出/重进体验粗糙：冷却期静默失败、暂停与首屏无区分、触屏模式无法暂停** (onboarding)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/Controls.ts:249-252, /Users/aaajiao/Documents/1bit/src/player/Controls.ts:255-263, /Users/aaajiao/Documents/1bit/src/player/Controls.ts:230-248, /Users/aaajiao/Documents/1bit/src/main.ts:200-235, /Users/aaajiao/Documents/1bit/index.html:13-21
  - 建议: Controls.onClick 中对 requestPointerLock() 的 Promise 加 catch 并短延迟重试（或在 #ui 上短暂显示'稍候再点'）；onPointerLockChange 解锁时给 #ui 切换一个 paused 修饰类，把标题文案换成'已暂停 — 点击继续'（index.html 加一行备用文案即可）；触屏模式监听双指长按或角落按钮以退出 isActive。
- **[high/break] 凝视的核心视觉反馈 uContrast 1.0→1.8 完全缺失** (gaze-loop)
  - 证据: src/core/ShaderUniformUpdater.ts:75-83, src/core/ShaderUniformUpdater.ts:96, src/main.ts:345-353, src/shaders/DitherShader.ts:205, src/shaders/DitherShader.ts:269, docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:66
  - 建议: 把 playerState.gazeIntensity 作为新参数传入 updateShaderUniforms（main.ts 调用处 + ShaderUniformUpdater 签名），在写 uContrast 时叠加凝视分量：u.uContrast.value = shaderConfig.uContrast + gazeIntensity * 0.8（或按房间基准插值至 +0.8），并在 GazeMechanic/PlayerManager 不变的前提下复用现成的 gazeIntensity 曲线，进入/退出自动随 intensity 平滑。注意 POLARIZED 基准已是 2.0，可对叠加量做 clamp 防止过曝。
- **[medium/break] 浅凝视对暗花玩家会反向把花变亮，规训方向自相矛盾** (gaze-loop)
  - 证据: src/player/GazeMechanic.ts:179-185, src/player/PlayerManager.ts:174-180, src/player/FlowerProp.ts:213-221, src/config/constants.ts:61-65
  - 建议: 在 PlayerManager 调用 forceFlowerIntensity 前对强制值做单向 clamp：forced = Math.min(calculateForcedFlowerIntensity(), 玩家当前 targetIntensity)，保证凝视只压不抬；同时可把阈值处的起始强制值从 0.5 降到约 0.35，让默认玩家在跨过 45° 的瞬间就能看到花明显变暗，弥补阈值穿越时刻的可感知性。
- **[medium/break] 天空之眼被凝视时毫无反应，'权威'对注视零回应** (gaze-loop)
  - 证据: src/world/SkyEye.ts:114-150, src/world/SkyEye.ts:136, src/main.ts:359-360
  - 建议: 给 SkyEye.update 增加 gazeState 参数（main.ts 已有 playerState.isGazing/gazeIntensity 可直接传）：凝视时①瞳孔向屏幕中心收拢并放大（pupil scale 随 gazeIntensity 插值），②压制随机眨眼（被直视时不眨，营造对峙感），③环转速随 gazeIntensity 加快 1.5-2 倍。三者都是现有字段的小改动，无需新几何体。
- **[medium/break] POLARIZED 凝视强化（哔哔声加快）连载体都不存在，凝视反馈四房间完全同质** (gaze-loop)
  - 证据: src/world/RoomConfig.ts:180-184, src/audio/AudioController.ts:107-109, src/audio/AudioEngine.ts:125-130, docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:670-673
  - 建议: 在 AudioController 增加 POLARIZED 专属的节拍层（applyRoomAmbient 中按 RoomType.POLARIZED 启动一个 setTimeout 调度的 440/880Hz 方波节拍，参照 startRainAmbient 的调度模式），并让 updateGaze 接收当前 RoomType（main.ts/PlayerManager 已持有），凝视时把节拍间隔乘以 1/(1+0.3*gazeIntensity) 实现'略微加快'。
- **[low/enhancement] 低通'变闷'实际感知耗时约为承诺 0.5 秒的 2-3 倍** (gaze-loop)
  - 证据: src/audio/AudioEngine.ts:152-158, src/config/audio.ts:10-12, docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:68
  - 建议: 在 AudioEngine.tick 中改为对 log(freq) 插值（current = exp(lerp(log(current), log(target), k*dt))），并把收敛速率调到约 6.0，使 0.5s 内达到目标频率的听感等效值；或直接用 setTargetAtTime(target, now, 0.15) 交给 Web Audio 原生指数过渡，删除手动 lerp。
- **[low/enhancement] 凝视判定只看 pitch，眼不在视野内也会触发规训，削弱因果归因** (gaze-loop)
  - 证据: src/player/GazeMechanic.ts:87-98, src/world/SkyEye.ts:15-19, src/world/SkyEye.ts:120-121
  - 建议: 保留 pitch 主判定（符合文档定义），但在 GazeMechanic.update 增加一个可选的方向校验：用相机朝向与（眼位置-玩家位置）方向的点积对 gazeIntensity 做衰减（点积<0 时归零），眼位置可由 main.ts 把 SkyEye 的 group.position 传入 PlayerManager；这样惩罚只在眼大致入画时发生，归因清晰且不改变正上方凝视的原有手感。
- **[high/break] 反抗提示只渲染一帧，实际不可见且永久失效** (override-loop)
  - 证据: src/main.ts:403-410, src/main.ts:41, src/player/OverrideMechanic.ts:228-242, src/player/OverrideMechanic.ts:295, src/ui/HUD.ts:45-47
  - 建议: 在 main.ts 或 OverrideMechanic 中加一个提示显示计时器：shouldShow 首次为 true 时启动（如 8 秒），计时期间持续向 HUD 传 visible:true，计时结束才 markHintShown()。中期应按设计改为 diegetic 呈现（POLARIZED 房间附近建筑表面闪烁文字），但先修计时器即可恢复可发现性。
- **[medium/break] 条件不满足或冷却中按覆盖键零反馈，玩家无法区分失败原因** (override-loop)
  - 证据: src/player/OverrideMechanic.ts:71, src/player/OverrideMechanic.ts:163-214, src/shaders/DitherShader.ts:314-321, src/ui/HUD.ts:41-43
  - 建议: 在 OverrideMechanic 区分失败原因并暴露给反馈层：冷却中按键让边缘脉冲以低强度/暗色显示剩余冷却（DitherShader 已有 uOverrideProgress 通道可复用）；在 POLARIZED 但未凝视时由 AudioController 播一个极轻的低频 thud 暗示『方向不对』；非 POLARIZED 房间可保持沉默（符合『只有这里能反抗』的叙事）。
- **[medium/break] 单次成功反抗几乎进不了日落快照，反抗→快照闭环不闭合** (override-loop)
  - 证据: src/stats/RunStatsCollector.ts:172-186, src/stats/RunStatsCollector.ts:205, src/stats/RunStatsCollector.ts:270-272, src/stats/StateSnapshotGenerator.ts:68-71, src/stats/StateSnapshotGenerator.ts:136-137, src/world/DayNightCycle.ts:9
  - 建议: 在 RunStatsCollector.generateTags() 把条件改为 `s.overrideSuccesses >= 1 || overrideRatio > 0.05`（overrideSuccesses 已在采集，零成本），让一次成功的『弄坏画面』必然出现在日落快照里。
- **[medium/enhancement] 承诺的着色器『崩溃显示原始三角形 0.1s』未实现** (override-loop)
  - 证据: src/shaders/DitherShader.ts:313-327, src/config/constants.ts:74-80, src/core/ShaderUniformUpdater.ts:116-119, src/audio/AudioController.ts:271-279, src/player/OverrideMechanic.ts:302-324
  - 建议: 给 DitherShader 加 uRawBypass uniform：在 effectTimer < FLASH_ON_DURATION 的 0.1s 窗口直接输出未 dither、未调色的 tDiffuse 原始渲染（保留当前 duotone 反转作为后续 0.4s 的余波），由 OverrideMechanic 暴露一个 getRawBypassValue() 经 ShaderUniformUpdater 传入。注意尊重设计文档的『无障碍设置可禁用闪烁』验收项。
- **[low/enhancement] 触发后持续按住期间反馈空窗，且效果时长与按住时长无关** (override-loop)
  - 证据: src/shaders/DitherShader.ts:314-321, src/player/OverrideMechanic.ts:135-140, src/config/constants.ts:74, src/player/PlayerManager.ts:174-180
  - 建议: 触发后按住期间让边缘脉冲以满强度常亮（把 GLSL 条件改为 progress>0，或新增 uOverrideSustain uniform），松键时再做一个 0.2s 的快速衰减，使『按住时长』在画面上有对应物。
- **[low/enhancement] 覆盖成功后世界瞬间完全复位，无任何当场残留** (override-loop)
  - 证据: src/player/OverrideMechanic.ts:302-324, src/config/constants.ts:78-80, src/player/PlayerManager.ts:174-180, src/world/SkyEye.ts:1
  - 建议: 成功触发后给本 run 留一个低成本残差：例如 ShaderUniformUpdater 接收一个随成功次数微增的常驻 uMisregister/uTemporalJitter 偏置（每次 +0.01，POLARIZED 的零抖动从此不再纯净），或让 SkyEye 在本 run 内对该玩家的注视反应略微迟疑——系统记得你反抗过。
- **[high/break] 房间状态边界与可见几何错位半个 chunk（40 米）** (room-transitions)
  - 证据: src/world/ChunkManager.ts:135, src/world/FloorTile.ts:57-64, src/world/ChunkManager.ts:785-800, src/world/ChunkManager.ts:226-227, src/world/RiftMechanic.ts:18-20
  - 建议: 把 ChunkManager.updatePlayerRoom 的 Math.floor 改为 Math.round（与 RiftMechanic.ts:18 的 Math.round 对齐），使房间状态格 [cx*80-40, cx*80+40) 与几何 footprint 完全重合；同步检查 main.ts 中依赖 getCurrentRoomType 的所有消费者（音频、riftMechanic 门控、HUD）无需其他改动。也可反向修（给 chunk 内容整体平移 +40），但 round 方案改动最小且与裂缝判定天然一致。
- **[high/break] 裂缝坐落在房间状态格的入口边线：进房瞬间坠落、且可能穿透完好地板** (room-transitions)
  - 证据: src/world/RiftMechanic.ts:18-43, src/main.ts:297-299, src/world/FloorTile.ts:119-156, src/config/physics.ts:32, src/world/ChunkManager.ts:785-788
  - 建议: 修复第 1 条的 round/floor 错位后裂缝自然回到房间中心、双侧 10 米铺垫恢复；另需在 RiftMechanic.update 中校验玩家所在 chunk（round 后的 cx,cz）确实是 FORCED_ALIGNMENT 且 z 在该 chunk footprint 内，才允许设置 groundLevel=-1000，杜绝穿透邻 chunk 完好地板的情况。
- **[medium/break] 过渡中途折返导致调色板/抖动参数单帧瞬跳** (room-transitions)
  - 证据: src/world/ChunkManager.ts:756-763, src/world/ChunkManager.ts:795-800, src/world/RoomConfig.ts:259-285
  - 建议: 在 ChunkManager.updatePlayerRoom 触发新过渡时，把当前的 this.currentShaderConfig 深拷贝冻结为本次过渡的 from 配置（新增字段如 transitionFromConfig），animate 中从它而非 ROOM_CONFIGS[previousRoomType].shader 插值，即可保证任意时刻折返都从屏幕当前状态连续过渡。
- **[medium/break] 过渡 whoosh 一次性音效无冷却，边界徘徊触发连发** (room-transitions)
  - 证据: src/audio/AudioController.ts:817-842, src/audio/AudioController.ts:281-297, src/config/audio.ts:93, src/main.ts:283-294
  - 建议: 在 AudioController.onRoomChange 给 playRoomTransition 加一个最小间隔冷却（如 1.5-2s，常量放 config/audio.ts），或把 whoosh 也移到去抖后的 applyRoomAmbient 路径（牺牲 250ms 即时性换取无连发）。
- **[medium/enhancement] 房间是单 chunk 孤岛，过渡事件过密稀释了"边界即事件"的感知** (room-transitions)
  - 证据: src/world/RoomConfig.ts:290-301, src/config/constants.ts:41-49, src/config/physics.ts:9-19
  - 建议: 在 RoomConfig.getRoomTypeFromPosition 改为对更粗的区域格取 hash（如 floor(cx/2), floor(cz/2) 形成 2x2=160m 房间区块，或用 RoomGeneration.ts 已有的 biome 带状逻辑做房间聚类），使同房间连续多 chunk；受 reproducibility-contract 约束仅需会话内确定性，seed 数学可自由改。
- **[low/enhancement] IN_BETWEEN 的 Z-fighting 伪影未与边界绑定，可感知性偏弱** (room-transitions)
  - 证据: src/world/ChunkManager.ts:327-329, src/world/ChunkManager.ts:388-415, src/config/constants.ts:94-101, src/world/FloorTile.ts:233-252
  - 建议: 在 ChunkManager.createChunk 中对 IN_BETWEEN chunk 距边缘一定范围内（如 |本地x|>30 或 |本地z|>30）的建筑提高 ghost 数量/偏移幅度，或在 FloorTile 的摩尔纹地板边缘条带叠加第二层共面平面，让伪影确实在"边界边缘"密集出现。
- **[high/break] 房间逻辑边界与视觉地块错位半个 chunk（40m），裂缝单侧不掉落** (room-visual-language)
  - 证据: src/world/ChunkManager.ts:135, src/world/FloorTile.ts:57-64, src/world/ChunkManager.ts:785-801, src/world/RiftMechanic.ts:18-44, src/main.ts:297-299, src/config/physics.ts:32
  - 建议: 把 ChunkManager.updatePlayerRoom 的取整改为 Math.round(playerX/CHUNK_SIZE)（与 RiftMechanic 已用的 Math.round 同一约定），使逻辑房间区间与视觉地块 [k*80-40, k*80+40] 重合；改完后玩家从任一侧接近裂缝时房间都已是 FORCED_ALIGNMENT，掉落物理对称。补一个 tests/ 内的纯逻辑测试：给定视觉地块边界两侧坐标断言房间归属。
- **[high/break] FORCED_ALIGNMENT 左右两侧视觉不对称完全缺失** (room-visual-language)
  - 证据: src/world/RoomConfig.ts:107, src/shaders/DitherShader.ts:243-249, src/world/RoomGeneration.ts:66-70, src/world/FloorTile.ts:96-145, src/world/RiftMechanic.ts:23, src/audio/AudioController.ts:603
  - 建议: 最小方案：在 ChunkManager/ShaderUniformUpdater 里，当前房间为 FORCED_ALIGNMENT 时按玩家相对裂缝中心（Math.round(x/80)*80）的有符号距离把 uNoiseDensity 在 0.4↔0.7 间插值，让"走向一侧世界变整洁/混乱"成立；进阶方案：给 DitherShader 加 uCrackScreenX uniform，按屏幕分侧应用两套 noiseDensity，并在 RoomGeneration 按 bx 符号分侧偏置建筑风格（左 BLOCKS、右 SPIKES/破碎旋转）。
- **[medium/break] INFO_OVERFLOW 的"花越亮世界越混乱"负反馈只接了一半，着色器方向甚至相反** (room-visual-language)
  - 证据: src/world/RoomConfig.ts:198-204, src/shaders/DitherShader.ts:269, src/core/ShaderUniformUpdater.ts:93, src/world/ChunkAnimator.ts:82, src/main.ts:268
  - 建议: 在 ChunkManager.getCurrentShaderConfig（或 ShaderUniformUpdater）中：当前房间为 INFO_OVERFLOW 时用 INFO_OVERFLOW_NOISE_MAP 对 flowerIntensity 做分段插值覆盖 uNoiseDensity，并把 threshold 的花强度项在该房间内反向或归零；这样调亮花会同时加密抖动 + 加快建筑闪烁，负反馈完整。
- **[medium/break] 天气与房间解耦：STATIC/雨可直接打破 POLARIZED 的"零噪声"承诺，数字雨在 INFO_OVERFLOW 基本缺席** (room-visual-language)
  - 证据: src/world/WeatherSystem.ts:59-131, src/main.ts:341-342, src/shaders/DitherShader.ts:330-353, src/world/RoomConfig.ts:164-178
  - 建议: 给 WeatherSystem.update 传入 currentRoomType 做房间加权：INFO_OVERFLOW 大幅提高 RAIN 概率（或常驻一层低强度数字雨）；POLARIZED 屏蔽 STATIC/RAIN（或把天气强度衰减到接近 0，只保留 GLITCH 作为"系统裂缝"瞬闪）。改动集中在 startRandomWeather 的类型抽取与 main.ts 的一行传参。
- **[medium/enhancement] POLARIZED 缺少棋盘格地面，且保留曲线几何；天空之眼未被强化** (room-visual-language)
  - 证据: src/world/FloorTile.ts:392-430, src/world/FloorTile.ts:23-50, src/shaders/DitherShader.ts:243-249, src/world/RoomGeneration.ts:58-64, src/world/SkyEye.ts:62-71, src/world/SkyEye.ts:88-97
  - 建议: 在 FloorTile 为 POLARIZED 两半地板各做一个共享棋盘格 DataTexture 材质（左右可用相位相反的棋盘呼应阵营）；RoomGeneration 把 POLARIZED 的 FLUID 分支并入 BLOCKS；SkyEye 增加按当前房间的状态接口，在 POLARIZED 时降低高度或放大环组（如 scale 1.6 倍）并提高环数，使其在视野中明显变大。
- **[low/enhancement] INFO_OVERFLOW 的"30m 内淡入纯噪声"地平线未做，全房间共用同一雾参数** (room-visual-language)
  - 证据: src/core/SceneSetup.ts:22, src/config/constants.ts:98-100, src/main.ts:91-95
  - 建议: 在房间切换（main.ts 第 3 步）时按 RoomType 对 scene.fog.near/far 做插值目标（INFO_OVERFLOW 约 8/45，其余维持 20/110），并可在 DitherShader 里用已有的 staticNoise 按伪深度（或雾因子近似）混入噪声而非纯灰，使远景真正"溶解成噪声"。
- **[high/break] 「调得太亮会吸引眼睛注视」叙事核心未实现：欲望-风险闭环只有单向** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/world/SkyEye.ts:114, /Users/aaajiao/Documents/1bit/src/world/SkyEye.ts:136, /Users/aaajiao/Documents/1bit/src/main.ts:359-360, /Users/aaajiao/Documents/1bit/src/player/GazeMechanic.ts:87-98, /Users/aaajiao/Documents/1bit/src/player/PlayerManager.ts:179
  - 建议: 把花强度传入 SkyEye.update（main.ts 已有 playerState.flowerIntensity 可直接传）：高强度时提高眨眼概率、收紧 stepEyeFollow 的 lerp/maxLag（眼睛贴得更近）、放大瞳孔追踪增益，并在 AudioController 加一个随花强度上升的低频「被注视」嗡鸣。这样玩家调亮花会立刻感到天上那只眼变得专注，闭环成立。
- **[high/break] 溢出闭环的世界级视觉反馈缺失：噪点密度映射是死代码、TemporalJitter 静态** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/world/RoomConfig.ts:198-204, /Users/aaajiao/Documents/1bit/src/core/ShaderUniformUpdater.ts:93-95, /Users/aaajiao/Documents/1bit/src/world/RoomConfig.ts:80-82, /Users/aaajiao/Documents/1bit/src/shaders/DitherShader.ts:267-269, /Users/aaajiao/Documents/1bit/src/shaders/DitherShader.ts:356-369, /Users/aaajiao/Documents/1bit/src/world/ChunkAnimator.ts:62-107
  - 建议: 在 ShaderUniformUpdater.updateShaderUniforms 里：当房间为 INFO_OVERFLOW 时用 INFO_OVERFLOW_NOISE_MAP（仿照 refreshIntervalForIntensity 写一个插值函数）以花强度调制 uNoiseDensity，并让 uTemporalJitter 随花强度从基准值向上抬（如 0.3+intensity*0.6）。需要把当前 RoomType 或一个「花调制开关」传进该函数，main.ts 已持有全部所需状态。
- **[medium/break] INFO_OVERFLOW 啁啾声不随花强度变密变响** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/main.ts:300-307, /Users/aaajiao/Documents/1bit/src/config/constants.ts:9, /Users/aaajiao/Documents/1bit/src/audio/AudioController.ts:261-269
  - 建议: main.ts 第4步里把 playerState.flowerIntensity 乘入触发概率（如 probability * (0.5 + intensity*1.5)），并给 playInfoChirp 加 intensity 参数调制 volume（0.02→0.06）。一行调用改动即可，因为 playerState 在同一作用域已可用。
- **[medium/break] 滚轮单次调整时承诺的「升调音频提示」实际静音，且帧率依赖** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/audio/AudioController.ts:488-506, /Users/aaajiao/Documents/1bit/src/player/FlowerProp.ts:219-222, /Users/aaajiao/Documents/1bit/src/player/Controls.ts:207-216, /Users/aaajiao/Documents/1bit/src/player/PlayerManager.ts:186
  - 建议: 改为事件驱动：在 PlayerManager.setupCallbacks 的 onFlowerIntensityChange 回调里（PlayerManager.ts:85-90）直接调用一次 audio.playFlowerChangeTone(targetIntensity, 0.1)，以目标值定音高（150+intensity*350 的升调映射已经写好）；保留逐帧路径仅用于凝视强制压暗时的下行音。同时把 flowerSilenceTimer 改成累加 delta 的秒计时。
- **[medium/enhancement] 凝视压暗花的瞬间，花恰好被移出第一人称视野** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/HandsModel.ts:304-312, /Users/aaajiao/Documents/1bit/src/config/constants.ts:56, /Users/aaajiao/Documents/1bit/src/player/FlowerProp.ts:213-221
  - 建议: 二选一：(a) 在 HandsModel.animate 里给持花右手设置更小的 pitchOffset 系数（如 0.6），让花在仰视时仍停留在画面下缘，玩家用余光看见它熄灭；(b) 凝视结束后让被压暗的花延迟 2-3 秒再恢复（在 FlowerProp 增加恢复延迟），保证低头时还能看到「熄灭后的花」。方案 b 改动最小且加重规训感。
- **[low/enhancement] 首载花朵脉冲与 60 秒无交互兜底提示未实现，可发现性全押在开始页文字上** (flower-feedback)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/FlowerProp.ts:142-143, /Users/aaajiao/Documents/1bit/index.html:19
  - 建议: 在 FlowerProp 加一个 introPulse 计时态：前 10 秒（或直到玩家第一次滚轮输入，Controls.onFlowerIntensityChange 可作为终止信号）让 targetIntensity 在 0.3-0.5 间正弦摆动；配合上面修好的调整音，玩家会注意到「这个光是活的、可调的」，开始页文字可降级为氛围文案。
- **[high/break] Run 结束（日落）挂在页面墙钟上，与实际游玩时间脱钩** (ending-snapshot)
  - 证据: src/main.ts:242, src/main.ts:252, src/main.ts:256-259, src/world/DayNightCycle.ts:39-49, src/main.ts:330-338, src/stats/RunStatsCollector.ts:201-204, src/stats/RunStatsCollector.ts:238-254, src/stats/StateSnapshotGenerator.ts:136-157
  - 建议: 让 DayNightCycle 维护自己的累积时钟（在 main.ts 的未暂停分支里 +=delta），而不是直接吃全局 t。这样开始界面/暂停时间不计入白天，日落永远发生在『被玩过』的时间轴上，既消除空 run 快照，也消除跨周期跳过。另可在 onSunset 前加最小 run 时长门槛（如 runStats.getDuration() < 30s 则跳过快照），双保险。
- **[medium/break] 快照展示用墙钟 setTimeout，暂停/切页期间照常流逝且无法重看** (ending-snapshot)
  - 证据: src/stats/SnapshotOverlay.ts:137-150, src/stats/SnapshotOverlay.ts:48-57, src/main.ts:224-235, src/main.ts:330-338, src/player/Controls.ts:255-262
  - 建议: 把 SnapshotOverlay 的计时改为由 main.ts 未暂停分支驱动的 update(delta)（与其它系统一致），暂停时冻结展示进度；或至少在 ChimeraVoid.setPaused(true) 时调用 overlay 的 pause/挂起。同时把最近一次 StateSnapshot 缓存在字段里，提供重看入口（比如暂停界面上显示上一份快照文本）。
- **[medium/break] 快照图案是全屏 CPU 逐像素渲染，叙事高潮处易掉帧** (ending-snapshot)
  - 证据: src/stats/SnapshotOverlay.ts:190-201, src/stats/SnapshotOverlay.ts:212-266
  - 建议: 两条路任选：(a) 按文档回归小尺寸——把 canvas 固定为 512×512 居中/右下角，CSS 放大，计算量降两个数量级；(b) 保留全屏但预渲染——图案参数在 show() 时已定，把静态部分先烤进离屏 canvas，动画相位用 ctx 变换或 CSS 实现，避免每帧逐像素重算。也可以直接走 DitherShader 加一个 snapshot 图案 uniform，复用 GPU。
- **[medium/enhancement] 体验没有任何『结束』出口：关标签页数据直接丢失，日落节律不可发现** (ending-snapshot)
  - 证据: src/main.ts:137, src/main.ts:166, src/main.ts:422-457, src/stats/RunStatsCollector.ts:192-194, index.html:13-21
  - 建议: 最小补法：在 beforeunload（或 visibilitychange→hidden 且停留超阈值）时若 runStats.getDuration() 足够长，把 normalize()+generateTags() 结果存 localStorage，下次进入开始界面时以一行小字呈现上次的快照文本——既不破坏无教程原则，又让玩家事后知道『这个世界会总结你』。再加一个环境层面的日落预告（如日落前 30 秒天空灰度渐变/音频铺垫，DayNightCycle 目前是瞬间翻转背景色），让结束『可被预感』。
- **[low/enhancement] 快照时刻缺少『这是结算』的框架感，易被误读为又一次天气故障** (ending-snapshot)
  - 证据: src/main.ts:330-338, src/world/DayNightCycle.ts:59-83, src/stats/SnapshotOverlay.ts:17-23, src/stats/SnapshotOverlay.ts:64-72, src/stats/StateSnapshotGenerator.ts:184-210
  - 建议: 给快照时刻加一层最小的『定格』语言：展示期间在 PlayerManager 里钝化移动速度或锁定输入 2-3 秒（类似 RiftMechanic 已有的控制干预先例），音频侧由 AudioController 做一次短暂的低通收束（已有 LowPassFilter 基建），与天气效果在感官上拉开差距。错峰处理 DayNightCycle 的 forceWeather('static')——日落帧若触发快照则跳过本次天气切换。
- **[high/break] 反抗提示只显示一帧，玩家不可能看到** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/main.ts:403-410, /Users/aaajiao/Documents/1bit/src/player/OverrideMechanic.ts:239-242, /Users/aaajiao/Documents/1bit/src/ui/HUD.ts:45-47, /Users/aaajiao/Documents/1bit/docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:769-777
  - 建议: 在 main.ts（或 HUD）给提示加显示时长：shouldShow 首次为 true 时启动一个 5-8 秒计时器，期间持续传 visible:true，计时结束才调用 markOverrideHintShown()。更贴近文档的做法是做成 diegetic：在 POLARIZED 房间附近建筑表面闪烁 [HOLD TO RESIST] 文本。
- **[high/break] 触屏设备：要么点『进入』毫无反应，要么进入后永远走不动** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/Controls.ts:82, /Users/aaajiao/Documents/1bit/src/player/Controls.ts:249-252, /Users/aaajiao/Documents/1bit/src/player/Controls.ts:267-349, /Users/aaajiao/Documents/1bit/src/main.ts:203-206, /Users/aaajiao/Documents/1bit/index.html:16-20
  - 建议: 在 Controls.ts 用 matchMedia('(pointer: coarse)') 或 'ontouchstart' in window 判定触屏；触屏路径加最小可玩输入（虚拟摇杆或按住屏幕前进）；若决定不支持触屏，至少在 index.html/启动检测里给触屏用户显示『需要键盘鼠标』而不是一个点了没反应的入口。
- **[medium/break] 昼夜时钟用墙钟（含开始界面与暂停时间），日落快照会在入场/恢复瞬间误触发** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/main.ts:250-259, /Users/aaajiao/Documents/1bit/src/world/DayNightCycle.ts:39-49, /Users/aaajiao/Documents/1bit/src/main.ts:325-339, /Users/aaajiao/Documents/1bit/src/world/WeatherSystem.ts:59-104
  - 建议: 在 ChimeraVoid 维护一个暂停感知的累计时间（每个未暂停帧 += delta），把它而不是墙钟 t 传给 DayNightCycle（必要时也给 updateCableTime/着色器 uTime），使昼夜节奏与玩家实际游玩时长对齐；这样首次日落稳定出现在游玩约 150s 处，与 5 分钟一局的节奏匹配。
- **[medium/break] 凝视闭环承诺的视觉反馈完全缺失，只有音频低通** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/core/ShaderUniformUpdater.ts:75-120, /Users/aaajiao/Documents/1bit/src/player/PlayerManager.ts:159-163, /Users/aaajiao/Documents/1bit/src/shaders/DitherShader.ts:269, /Users/aaajiao/Documents/1bit/docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:756-766
  - 建议: 把 playerState.gazeIntensity 作为参数传入 updateShaderUniforms，在 DitherShader 里新增 uGazeIntensity：凝视时叠加 uContrast 提升（对比度变硬）并在屏幕边缘画 45° 阈值细线/暗角脉冲；这同时兑现无障碍承诺。
- **[medium/break] 每局固定出生在最吵的 INFO_OVERFLOW，第一分钟与『安静觉醒』相反** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/main.ts:113, /Users/aaajiao/Documents/1bit/src/world/RoomConfig.ts:290-301, /Users/aaajiao/Documents/1bit/src/main.ts:300-308, /Users/aaajiao/Documents/1bit/docs/DESIGN_PHILOSOPHY_AND_ROADMAP_ZH.md:35-38
  - 建议: 让出生房间可控：要么在 main.ts 启动时从出生点向外搜索最近的 IN_BETWEEN/POLARIZED chunk 并把 spawn 设到那里，要么在 getRoomTypeFromPosition 里给 (0,0) 周边一圈 chunk 固定安静房型，保证旅程第一阶段的『安静循环』成立。
- **[low/enhancement] Esc 后立刻点击会因浏览器指针锁冷却而无声失败** (session-flow)
  - 证据: /Users/aaajiao/Documents/1bit/src/player/Controls.ts:249-252, /Users/aaajiao/Documents/1bit/src/main.ts:203-206
  - 建议: 在 Controls.onClick 里对 requestPointerLock() 的返回值（Promise）加 .catch：失败时延迟 ~1.3s 自动重试一次，或在 #ui 上短暂显示『稍等片刻再点击』，消除恢复路径上的无声失败。
