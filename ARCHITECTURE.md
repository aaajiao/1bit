# 代码架构指南

> 在添加新功能前请先阅读此文件

---

## 📁 目录结构

```
src/
├── main.ts          # 仅负责：初始化、组装系统、运行主循环
├── types.ts         # TypeScript 类型定义
├── audio/           # 音效系统
│   └── AudioSystem.ts
├── core/            # 核心初始化模块
│   ├── PostProcessing.ts
│   └── SceneSetup.ts
├── player/          # 玩家相关（控制、手部、道具、机制）
│   ├── Controls.ts
│   ├── FlowerProp.ts
│   ├── GazeMechanic.ts
│   ├── HandsModel.ts
│   └── OverrideMechanic.ts
├── shaders/         # 着色器
│   └── DitherShader.ts
├── stats/           # 游戏统计与快照系统
│   ├── RunStatsCollector.ts
│   ├── SnapshotOverlay.ts
│   └── StateSnapshotGenerator.ts
├── world/           # 世界系统（区块、建筑、天气、昼夜...）
│   ├── BuildingFactory.ts
│   ├── CableSystem.ts
│   ├── ChunkManager.ts
│   ├── DayNightCycle.ts
│   ├── FloorTile.ts
│   ├── FloraFactory.ts
│   ├── RoomConfig.ts
│   ├── SharedAssets.ts
│   ├── SkyEye.ts
│   └── WeatherSystem.ts
└── utils/           # 工具函数
    ├── hash.ts
    └── ObjectPool.ts

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
- 共享接口和类型放在 `types.ts`
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
| 渲染效果 | `shaders/` | DitherShader |
| 音效 | `audio/` | AudioSystem |
| 工具 | `utils/` | hash, ObjectPool |
| 样式 | `styles/` | main.css |

---

## 🔄 重构信号

如果发现以下情况，应该重构：
- `main.ts` 超过 300 行 ✅ *（当前约 329 行，已通过模块化改善）*
- 同一功能的代码分散在多处
- 需要复制粘贴代码

---

## 📝 当前状态

- **语言**: TypeScript
- **构建工具**: Vite
- **主要依赖**: Three.js

*最后更新: 2024-12-22*
