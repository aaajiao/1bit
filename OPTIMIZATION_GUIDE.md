# 1-Bit 风格游戏优化建议

> **项目**: Wired Brutalism: Chimera Void
> **分析日期**: 2025-12-21
> **最后更新**: 2025-12-23

---

## 📊 实施进度

| 功能 | 优先级 | 状态 |
|------|--------|------|
| 边缘检测轮廓线 | 高 | ✅ 完成 |
| 深度感知抖动 | 高 | ✅ 完成 |
| 天空之眼互动 | 高 | ✅ 完成 |
| 程序化音效 | 中 | ✅ 完成 |
| 昼夜循环反转 | 中 | ✅ 完成 |
| CRT 曲率模拟 | 中 | ⏸️ 暂停 |
| 天气系统 | 原低→已实施 | ✅ 完成 |
| 收集系统 | 低 | ⏳ 待开发 |
| 隐藏区域 | 低 | ⏳ 待开发 |

---

## ✅ 已实现功能详情

### 高优先级

#### 1. 边缘检测轮廓线
使用 Sobel 边缘检测在物体边缘叠加黑线，增强版画感。
- 文件：`src/shaders/DitherShader.js`
- 配置：`enableOutline`, `outlineStrength`

#### 2. 深度感知抖动
近处使用 8×8 矩阵细腻过渡，远处使用 2×2 矩阵强调块状感。
- 文件：`src/shaders/DitherShader.js`
- 配置：`enableDepthDither`, `ditherTransition`

#### 3. 天空之眼互动
瞳孔追踪玩家位置，随机眨眼动画，手部自动避让。
- 文件：`src/main.js`
- 关键：`fog: false` 避免雾效遮挡

### 中优先级

#### 4. 程序化音效
使用 Web Audio API 生成 8-bit 风格声音。
- 文件：`src/audio/AudioSystem.js`
- 音效：脚步声、环境音、眨眼声、昼夜过渡声

#### 5. 昼夜循环
每 5 分钟切换日/夜，夜间黑白颜色反转。
- 文件：`src/main.js`
- 配置：`app.dayNight.cycleDuration`

#### 6. 天气系统
三种 1-bit 风格天气效果，随机触发。
- 文件：`src/world/WeatherSystem.js`, `src/shaders/DitherShader.js`
- 效果：静态雪花、数字雨、信号干扰
- 测试：`app.weather.forceWeather('static', 10)`

---

## ⏳ 待开发功能

### 收集系统
在区块中随机生成可收集的发光球体，增加探索动机。

### 隐藏区域
- 发光的符文（特定角度可见）
- 隐藏洞穴（TREE 建筑根部）
- 漂浮的古老符号

---

## 🖼️ 经典 1-Bit 参考

| 游戏/项目 | 特征 |
|----------|------|
| **Obra Dinn** | 4色调色板 + 粗糙抖动 |
| **Classic Mac Games** | 蓝噪声 + 精细边缘 |
| **Pico-8 游戏** | 强烈的像素边界 |

---

---

## ⚡ 性能优化 (2025-12-23)

### 已完成优化

#### 1. 常量集中管理
将散落在代码中的魔法数字提取到 `src/config/constants.ts`：
- 游戏逻辑常量 (GAMEPLAY)
- 电缆检测参数 (CABLE_PROXIMITY)
- 世界生成配置 (WORLD)
- 凝视机制阈值 (GAZE)
- 反抗机制参数 (OVERRIDE)
- 房间过渡配置 (ROOM_TRANSITION)
- 性能调优参数 (PERFORMANCE)

#### 2. Vector3 对象复用
优化 `PlayerManager.getPosition()` 避免每帧创建新对象：
- 使用静态 Vector3 实例
- 减少 GC 压力

#### 3. 电缆音频检测节流
优化电缆距离检测逻辑：
- 每 3 帧检测一次（而非每帧）
- 50m 外提前跳过检测
- 显著降低 CPU 开销

#### 4. 资源清理工具
新增 `src/utils/dispose.ts` 工具函数：
- `disposeObject3D()`: 递归释放 Object3D 层级资源
- `disposeRenderTarget()`: 释放渲染目标
- `removeAndDispose()`: 移除并释放对象

#### 5. 生命周期管理
为核心系统添加 `dispose()` 方法：
- ChimeraVoid (主应用)
- ChunkManager (区块管理)
- AudioController / AudioEngine (音频系统)
- SkyEye (天空之眼)
- HandsModel (手部模型)
- PlayerManager (玩家管理)

#### 6. 区块清理优化
改进 `ChunkManager.removeChunk()`：
- 完整释放几何体、材质、纹理
- 从场景中正确移除对象

---

*文档最后更新于 2025-12-23*
