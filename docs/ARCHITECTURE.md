# 代码架构指南

> 在添加新功能前请先阅读此文件

---

## 📁 目录结构

```
src/
├── main.ts          # 仅负责：初始化、组装系统、运行主循环（ChimeraVoid 类）
├── types/           # TypeScript 类型定义（模块化）
│   ├── audio.ts     # 音频接口
│   ├── world.ts     # 世界/区块/天气类型
│   ├── player.ts    # 玩家/控制/手部类型
│   ├── shader.ts    # 着色器 uniform 类型
│   ├── app.ts       # 应用配置
│   └── index.ts     # 统一导出
├── audio/           # 音效系统
│   ├── AudioController.ts # 高层音频控制器（业务逻辑）
│   └── AudioEngine.ts     # 底层 WebAudio 引擎
├── config/          # 配置常量（单一事实来源）
│   ├── audio.ts     # 音频参数配置
│   ├── constants.ts # 集中管理的游戏常量（性能、机制阈值等）
│   ├── physics.ts   # 物理/玩家参数配置
│   └── index.ts     # 统一导出
├── core/            # 核心初始化 + main.ts 每帧调用的逐帧 helper 层
│   ├── BootGuard.ts          # 启动守卫：WebGL 检测 + 无 WebGL 时的 DOM 降级渲染
│   ├── BurnInPass.ts         # INFO 烧屏残影：凝视静止检测 + 热度 ping-pong 缓冲（uBurnMap/uBurnAmount）
│   ├── CableAudioUpdater.ts  # 每帧根据玩家与线缆的距离更新音频
│   ├── CableUplinkUpdater.ts # 花光超阈值时驱动线缆上报脉冲（流向天眼）
│   ├── DataWaterfallUpdater.ts # INFO 数据瀑布滚动驱动（花亮度调速，单 uniform）
│   ├── FrameClock.ts         # 渲染时钟：钳制后的帧 delta + 累计秒数（防卡顿大步进）
│   ├── HudUpdater.ts         # 每帧刷新调试 HUD 与行为标签/抗拒提示文本（含触控降级）
│   ├── PauseController.ts    # 窗口/文档事件接线 + 暂停状态机（恢复时重置帧计时）
│   ├── PostProcessing.ts     # 后处理合成器（Dither 着色器 + 蓝噪声纹理）
│   ├── PrecipitationUpdater.ts # 世界降水驱动（雨/灰烬/风，喂 Precipitation + AshTraces）
│   ├── ProximityUpdaters.ts  # 近玩家逐帧扫描统一入口（线缆音频/上报 + seam 互换）
│   ├── RoomFlowUpdater.ts    # 每帧房间归属/行为画像/世界系统驱动（房间切换、裂缝、雾、剪影、幽灵、反抗传染窗口）
│   ├── SceneSetup.ts         # 场景与相机初始化
│   ├── SeamSwapUpdater.ts    # POLARIZED seam 带内阵营语言互换驱动
│   ├── ShaderSyncUpdater.ts  # 每帧着色器参数聚合（main 实际调用者；内置 F5 应激→颗粒平滑器）
│   ├── ShaderUniformUpdater.ts # 底层 uniform 写入工具（纯函数，被 ShaderSyncUpdater 调用）
│   ├── StatsSunsetUpdater.ts # 日落快照 / 遗忘 / 疤痕 / 天穹与蚀暗化的每帧驱动
│   ├── StressLevel.ts        # 应激等级（0-1 压力 → uDitherScale，分辨率即情绪）
│   └── WeatherReactionsUpdater.ts # 天气行为反应驱动（风吹/前兆朝向/余波痕迹）
├── player/          # 玩家相关（控制、手部、道具、机制）
│   ├── Controls.ts          # 玩家移动与输入控制
│   ├── FlowerHintMechanic.ts # 60 秒无操作时在 HUD 淡入的极简花朵调节提示
│   ├── FlowerProp.ts        # 手持花朵道具及其状态/动画
│   ├── GazeMechanic.ts      # 注视机制（检测玩家看向 Sky Eye）
│   ├── HandsModel.ts        # 玩家手部模型管理
│   ├── OverrideMechanic.ts  # “Override”机制逻辑（Shift 键触发）
│   ├── PlayerManager.ts     # 玩家系统总管（整合 Controls, Hands, Gaze, Override, Echo）
│   └── ViewmodelEcho.ts     # IN_BETWEEN 视模型错位重影（共享几何、逐帧同步变换）
├── shaders/         # 着色器
│   ├── BlueNoiseTexture.ts  # 启动时一次性生成的蓝噪声有序抖动阈值纹理（确定性）
│   └── DitherShader.ts      # 1-bit 抖动着色器定义
├── stats/           # 游戏统计与快照系统
│   ├── RunStatsCollector.ts     # 收集本轮游戏的数据（注视时间、移动等）
│   ├── ScarStorage.ts           # 疤痕持久化（跨会话记录每次成功 override，1bit:scars）
│   ├── SnapshotCard.ts          # 把日落快照合成为可下载的 1-bit 分享卡片（F6）
│   ├── SnapshotOverlay.ts       # 生成并在日落时显示的统计快照 UI
│   ├── SnapshotPattern.ts       # 快照 1-bit 图案数学（overlay 与卡片共用的纯函数）
│   ├── SnapshotStorage.ts       # 快照持久化（可注入存储，1bit:lastSnapshot）
│   ├── StateSnapshotGenerator.ts # 将统计数据转化为视觉快照的逻辑
│   └── TrailRecorder.ts         # 幽灵轨迹采样与持久化（1bit:lastTrail）
├── ui/              # 用户界面与HUD
│   └── HUD.ts            # 抬头显示器（坐标、状态调试信息）
├── world/           # 世界系统（区块、建筑、天气、昼夜...）
│   ├── AshTraces.ts       # 灰烬地面痕迹池（余波期逐像素硬阈值溶解）
│   ├── BuildingFactory.ts # 程序化建筑生成
│   ├── CableSystem.ts     # 程序化电缆生成与动画
│   ├── ChunkAnimator.ts   # 区块动画逻辑（建筑、植物、雾气）
│   ├── ChunkManager.ts    # 无限世界区块管理系统
│   ├── DataWaterfall.ts   # INFO 立面数据瀑布（共享字符纹理，一材质一 uniform）
│   ├── DayNightCycle.ts   # 昼夜循环控制
│   ├── DuskSnap.ts        # POLARIZED 没有黄昏：预兆渐变的呈现值硬切（逻辑状态机不动）
│   ├── EclipseDarkening.ts # 蚀的暗化通道（组合到背景色上，绝不经过昼夜状态机）
│   ├── FigureSystem.ts    # 远景 1-bit 人形剪影（F3，不可交互的叙事布景；中段共鸣/反抗传染/疤痕见证者）
│   ├── FloorTile.ts       # 地面瓦片与网格生成
│   ├── FloraFactory.ts    # 程序化植物生成
│   ├── GhostSystem.ts     # 幽灵回放（F4，重走上一局轨迹的半透明身影）
│   ├── Precipitation.ts   # 世界空间降水（单 InstancedMesh 顶点着色器驱动）
│   ├── RainGlyphPuddles.ts # INFO 雨后字符水洼（余波期溶解）
│   ├── RiftMechanic.ts    # 裂缝机制（坠落、重生、音频）
│   ├── RoomConfig.ts      # 不同“心智房间”的配置；亦为 chunk↔cluster↔world 坐标换算唯一来源
│   ├── RoomGeneration.ts  # 逐房间程序化生成纯函数（按 RoomType 赋予建筑身份）
│   ├── RoomLedger.ts      # 会话级 cluster→房间归属账本（F1，首次生成时定身份并保持）
│   ├── RoomSky.ts         # 每房间一种天空的穹顶（自有着色器；随天气/昼夜/蚀响应）
│   ├── RoomTransition.ts  # 房间过渡纯状态机（混合显示中的着色器配置）
│   ├── ScarField.ts       # 世界疤痕场纯数学（F2，抗拒地点周围建筑的永久几何扭曲）
│   ├── ShadowAftermath.ts  # FA 风暴余波：阴影抖动与逐位精确复位
│   ├── ShadowCorrection.ts # FA 理想化阴影贴片（单一全局方位角；疤痕处失准）
│   ├── SharedAssets.ts    # 共享材质与几何体资源
│   ├── SkyEye.ts          # 空中“Sky Eye”对象的行为与视觉
│   ├── SnapshotEcho.ts    # 运行中把本局快照指纹草稿闪现到附近建筑立面
│   ├── WeatherReactions.ts # 天气反应纯逻辑（风吹倍率/前兆朝向/余波选取与复位）
│   └── WeatherSystem.ts   # 天气核心（前兆→爆发→余波；雨/静电/故障/灰烬/风/蚀；行为偏置）
└── utils/           # 工具函数
    ├── dispose.ts          # Three.js 资源释放工具（几何体、材质、纹理）
    ├── hash.ts             # 字符串哈希工具
    └── ScreenshotManager.ts # 截图功能管理

styles/
└── main.css         # 全局样式
```

---

## ✅ 新功能开发规则

### 1. 每个系统一个文件
- ❌ 不要在 `main.ts` 中写业务逻辑
- ✅ 创建独立模块，如 `WeatherSystem.ts`

### 2. 类的基本结构
```typescript
export class NewSystem {
    private state: SomeType;
    
    constructor() {
        // 初始化状态
    }

    update(delta: number, context: SomeContext): void {
        // 每帧更新逻辑
        // context 包含需要的外部依赖
    }
}
```

### 3. main.ts 只做三件事
```typescript
// 1. 导入系统
import { NewSystem } from './world/NewSystem';

// 2. 在 constructor() 中实例化
this.newSystem = new NewSystem();

// 3. 在 animate() 中更新
this.newSystem.update(delta, { /* 依赖 */ });
```

### 4. 类型定义
- 共享接口和类型放在 `src/types/` 目录，经 `index.ts` 统一再导出
- 模块私有类型可以放在模块文件内

---

## 📂 放置位置

| 功能类型 | 目录 | 示例 |
|----------|------|------|
| 核心初始化 | `core/` | SceneSetup, PostProcessing |
| 环境效果 | `world/` | WeatherSystem, DayNightCycle, SkyEye |
| 玩家相关 | `player/` | Controls, HandsModel, FlowerProp |
| 玩家机制 | `player/` | GazeMechanic, OverrideMechanic |
| 统计/快照 | `stats/` | RunStatsCollector, SnapshotOverlay |
| UI/HUD | `ui/` | HUD |
| 渲染效果 | `shaders/` | DitherShader |
| 音效 | `audio/` | AudioEngine, AudioController |
| 工具 | `utils/` | hash, dispose, ScreenshotManager |
| 样式 | `styles/` | main.css |

---

## 🔄 重构信号

如果发现以下情况，应该重构：
- `main.ts` 超过 300 行 ✅ *（当前约 300 行，已达 300 行上限阈值；已提取 PlayerManager 和 RiftMechanic）*
- 同一功能的代码分散在多处
- 需要复制粘贴代码

---

## 📝 当前状态

- **语言**: TypeScript
- **构建工具**: Vite
- **测试**: Vitest (`bun run test`)
- **主要依赖**: Three.js

### 测试覆盖

`tests/` 下共 45 个测试文件，覆盖 hash / 房间 / 快照 / 天气生命周期与降水 / 烧屏与黄昏硬切 / 各机制等纯逻辑。

*最后更新: 2026-06-15*

