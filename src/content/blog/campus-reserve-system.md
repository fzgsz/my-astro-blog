---
title: "从单类脚本到 MVC：我的校园资源预约系统 20 次迭代"
description: "一次软件构造综合实践复盘：三层架构怎么演进到 MVC，统一返回、状态机、注解切面、线程池和双持久化是怎么落地的，以及我踩过的那些坑。"
pubDate: 2026-11-15
tags: ["Java", "软件构造", "架构设计", "设计模式", "课程设计"]
featured: false
heroImage: ../../assets/campus-reserve-cover.png
---

这学期的《软件构造综合实践》任务书有 20 个任务：从"在一个 `main` 方法里写登录"开始，一路加到资源管理、预约审核、分层架构、设计模式、UML、日志、并发，最后还要交结题报告和演示录屏。

做完之后，我最大的感受不是"功能真多"，而是：**每一次重构，都是在还上一版留下的债**。

这篇文章不贴完整代码，主要记录三件事：架构是怎么一步步改过来的、几个关键机制怎么落地、以及我实际踩过的坑。

## 项目做了什么

一个校园资源预约系统，两个角色：

- **管理员**：维护教室 / 实验室 / 设备 / 场地，审核预约，看统计报表和操作日志
- **学生**：查看可预约资源，提交预约，取消预约，查看自己的记录

核心业务闭环是：

```text
学生登录 → 浏览资源 → 提交预约（PENDING）
        → 管理员审核 → 通过（PASS，资源置为占用）/ 驳回（REJECT，记录原因）
        → 学生取消（CANCEL，资源释放）
```

技术栈刻意保持"原生"：JDK 8、纯 Java 标准库、没有 Spring、没有 MyBatis、没有第三方 JSON 库。数据默认落在四个文本文件里，也可以通过配置切到 MySQL。控制台版本是课程要求的满分基线，另外做了一个 Swing 桌面视图和配置文件驱动的双持久化作为加分项。

先看控制台菜单（节选真实运行记录）：

```text
------ 管理员菜单 ------
  1. 查看全部资源
  2. 新增资源
  3. 修改资源
  4. 删除资源
  5. 查看全部预约
  6. 查看待审核预约
  7. 审核通过
  8. 审核驳回
  9. 按条件查询预约
  10. 资源预约统计报表
  11. 热门资源 TOP N
  12. 用户预约统计
  13. 全局预约状态汇总
  14. 全部操作日志
  15. 按用户名查询日志
  0. 退出登录
```

## 架构不是设计出来的，是改出来的

### V1：所有东西塞进一个类

前两个任务要求"不做分层、不抽工具类"，故意把 Scanner 输入、账号校验、菜单打印写在 `SystemMain` 里。当时觉得这有什么难的，直到任务 3 加实体、任务 4 加文件持久化，`main` 方法开始失控：登录要读文件，注册要写文件，菜单里还夹着异常处理。

这个阶段最大的收获是**知道了不分层有多痛**，后面做三层重构时才有动力。

### V3.1：三层架构

任务 10 要求固定包结构：`ui.console`、`service`、`dao`、`entity`、`exception`、`utils`，并且调用方向只能是 UI → Service → DAO。

![三层架构 UML 类图](/images/campus-reserve/uml-3layer-v3.1.png)

*图 1：任务 10 的三层架构 UML 类图*

重构时我把所有 `System.out.println` 从 Service 里搬走，把文件读写收进 DAO，把业务校验留在 Service。改完之后 Service 终于可以在不启动控制台的情况下单独测试了。

但三层架构还有个问题：**流程逻辑散在菜单代码里**。比如"先查资源、再判断状态、再调 Service"这三步写在 `AdminView` 的某个 case 里，将来换成 Swing 或网页，这套流程就得抄一遍。

### V4.0：MVC

任务 13 加了 `controller` 包：View 只负责读输入、打表格，Controller 负责参数转发、会话维护、异常包装，Service 和 DAO 一行没改。

![MVC 架构 UML 类图](/images/campus-reserve/uml-mvc-v6.0.png)

*图 2：任务 13 之后的 MVC 架构 UML 类图（含工厂、装饰器、适配器和日志切面）*

两次架构的差别可以总结成一张表：

| 对比项 | 三层架构 | MVC |
| --- | --- | --- |
| 视图职责 | 直接调用 Service，流程判断散落 | 只做输入输出，流程交给 Controller |
| 换视图 | 流程逻辑要重写 | 只新增 View 层代码 |
| 异常处理 | 各菜单自己 try-catch | Controller / 切面统一转 `Result` |
| 依赖方向 | UI 依赖多个 Service | View → Controller → Service → DAO 接口 |

后来做 Swing 视图时，这个设计直接省了大事：`AdminFrame`、`StudentFrame` 只调 Controller，业务代码完全没动。

## 六个让我印象最深的实现

### 1. 用 `Result<T>` 统一返回

任务 7 之前，方法返回值五花八门：有的返回 `boolean`，有的返回对象，找不到就返回 `null`。调用方永远在判空，失败也没有原因。

统一之后：

```java
public class Result<T> {
    private boolean success;
    private String msg;
    private T data;

    public static <T> Result<T> success(String msg, T data) {
        return new Result<T>(true, msg, data);
    }

    public static <T> Result<T> fail(String msg) {
        return new Result<T>(false, msg, null);
    }
}
```

视图层只做一件事：`if (result.isSuccess())` 就展示数据，否则展示 `msg`。异常不再直接抛到控制台，用户永远看不到堆栈。

### 2. 状态机放进枚举，而不是散在 if-else 里

预约有四个状态：`PENDING`、`PASS`、`REJECT`、`CANCEL`。任务 11 要求只能按固定规则流转，非法流转必须拦截。

我把规则收敛到枚举里：

```java
public boolean canTransferTo(ReserveStatus target) {
    switch (this) {
        case PENDING:
            return target == PASS || target == REJECT || target == CANCEL;
        case PASS:
            return target == CANCEL;
        default:
            return false;   // REJECT / CANCEL 是终态
    }
}
```

审核、取消之前先判断 `canTransferTo`，不合法就抛 `IllegalStatusException`。这样"已驳回不能再次审核""已取消不能二次取消"这些规则只写一遍，新增状态也不用改业务流程。

### 3. 注解 + 反射，做一个零侵入的日志切面

任务 15 不允许用 Spring AOP，只能用 JDK 反射。思路很简单：自定义一个 `@OperationLog` 注解，标在业务方法上；Controller 调用时统一走 `LogAspect.invoke`，由它反射读取注解、执行方法、捕获结果和异常，最后异步写日志。

```java
OperationLog annotation = method.getAnnotation(OperationLog.class);
try {
    Object value = method.invoke(target, args);
    result = (Result<T>) value;
} catch (InvocationTargetException e) {
    Throwable cause = e.getTargetException();
    result = Result.fail(cause instanceof BusinessException
            ? cause.getMessage() : "操作失败，系统内部错误");
    exceptionMsg = cause.getClass().getSimpleName() + ": " + cause.getMessage();
}
if (annotation != null) {
    record(target, method, annotation, args, result, exceptionMsg);
}
```

业务方法只多了一行注解，日志里自动有操作人、时间、方法名、参数、返回值、异常。登录和注册的密码参数在序列化时被替换成 `******`，不会明文落盘。

### 4. 线程池异步写日志，同时保证不丢

日志写文件是磁盘 IO，如果同步做，控制台每次操作都要等一下。任务 17 要求用线程池异步化：

```java
POOL = new ThreadPoolExecutor(2, 4, 60L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<Runnable>(200),
        new NamedThreadFactory("campus-async-"),
        new ThreadPoolExecutor.CallerRunsPolicy());
```

内存里的日志集合是同步写入的，文件落盘才提交给线程池。程序退出时调用 `shutdown()` 并 `awaitTermination(5s)`，再配合 JVM 关闭钩子，保证队列里的日志写完再退出。

对应的并发安全也做了：DAO 的 `ArrayList` 用 `Collections.synchronizedList` 包装，增删改和批量读取都显式 `synchronized`；日志文件追加用静态锁 + `APPEND` 模式，避免多线程写串行。

### 5. 简单工厂 + 配置文件，切换文件/数据库

任务 19 要求"改配置就能换存储"。做法是抽 DAO 接口，然后让 `DaoFactory` 根据 `storageType` 决定 new 哪个实现：

```java
if ("db".equals(storageType)) {
    try {
        DBUserDao dbUserDao = new DBUserDao();
        dbUserDao.count();          // 试连，验证驱动和表结构
        userDao = dbUserDao;
    } catch (RuntimeException e) {
        degrade = "数据库不可用，已降级为文件存储";
    }
}
if (userDao == null) {
    userDao = FileUserDao.getInstance();
}
```

Service 的字段类型是 `UserDao` 接口，所以换存储不需要改业务代码。没有 MySQL 驱动、连接失败、配置写错，都会自动降级成文件存储，并在启动横幅里说明原因——这个降级路径我实测过，比"假装支持数据库"更靠谱。

### 6. 装饰器和适配器，都是被真实需求逼出来的

- **装饰器**：资源查询在统计和审核里反复调用，每次全量读文件。`CachingResourceDaoDecorator` 实现同一个 `ResourceDao` 接口，内部持有被装饰的 DAO 和一份缓存；写操作后失效缓存，读操作返回副本。原 DAO 和 Service 都没改。
- **适配器**：V1 的 `user.txt` 只有"用户名,密码"两个字段，V6 是四个字段。`LegacyUserDataAdapter` 把旧格式转成 `User` 对象，旧数据不用手工迁移，直接能启动。

## 踩过的坑

### 坑 1：Swing 窗口闪一下就没了

这个 bug 印象最深。`SwingApp.launch()` 里用的是：

```java
SwingUtilities.invokeLater(() -> new LoginFrame().setVisible(true));
```

`invokeLater` 是异步的，它只负责把"创建窗口"排进事件队列就返回了。`launch()` 返回后，`main` 线程继续往下走，执行到 `System.exit(0)`，窗口刚建出来就被结束，于是"闪一下"。

修复方式是 `invokeAndWait` 等窗口真正创建完成，然后主线程用 `CountDownLatch` 阻塞等待，关闭窗口时再由 `System.exit` 正常退出。顺手加了 headless 检测和回退控制台的逻辑。

这件事让我理解了：**GUI 程序的 main 线程不是"启动完就可以退出"的**。

### 坑 2：文本持久化的分隔符

一开始直接用 `|` 拼字段，直到某次预约备注里写了 `A|B`，再启动时整行解析错位。后来写了 `TextCodec`，把反斜杠、竖线、换行都转义，空值用 `\N` 表示，才算稳定。写文件也改成"先写临时文件再原子替换"，避免程序中断留下半截文件。

### 坑 3：缓存装饰器的一致性

给资源加缓存后，出现过"审核通过了但列表还显示可预约"的问题。原因是只在读的时候缓存，写操作忘了失效。修好之后又发现 `findAll` 直接把内部列表返回出去，调用方一改就污染缓存，于是改成返回 `new ArrayList<>(snapshot)`。

### 坑 4：并发写日志

8 个线程同时提交预约，日志文件偶尔出现两行粘在一起。原因是没有对文件写入加锁。加上静态锁、统一走 `appendLine`、并用 `APPEND` 模式打开之后，再跑 8 线程，日志文件没有再出现粘行，条数也符合预期。

## 测试：65 项自检 + 8 线程并发

课程没有强制要求单元测试，但我还是写了一个 `SystemSelfTest`，启动时用临时目录隔离数据，跑完自动清理。覆盖注册登录、权限、资源 CRUD、预约提交/审核/取消、状态机非法流转、统计、日志脱敏、反射工具、单例和持久化，一共 65 项断言。

```text
[PASS] 22. 提交预约成功
[PASS] 29. 审核通过成功
[PASS] 30. 通过后资源置为占用
[PASS] 33. 占用资源禁止新预约
[PASS] 43. 存在已通过预约的资源禁止删除
[PASS] 49. 全局汇总数量与预约记录一致
[PASS] 55. 反射序列化密码脱敏
=== 自检结束：通过 65 项，失败 0 项 ===
```

另外写了一个 `ConcurrencyDemo`：8 个线程同时登录并提交预约，主线程并发执行统计查询。结果是 8 条待审核记录、8 次提交全部成功，没有出现 `ConcurrentModificationException`，日志条数也和操作数一致。

## 复盘

**做对的地方：**

1. 先统一"返回值、异常、状态"这三件事，再做架构。后面加功能基本只写业务，不用再纠结错误怎么传。
2. 每次重构都以"行为不变"为前提，用同一套自检脚本回归，改完跑一遍就知道有没有退化。
3. 把设计模式用在真实痛点上（缓存、旧数据、存储切换），而不是为了凑模式而模式。

**还不够好的地方：**

- 密码还是明文存储，只做了日志脱敏。生产环境应该用 BCrypt 加盐哈希。
- 文件存储每次修改全量重写，数据量大时性能一般，可以改成追加 + 定期整理，或者干脆用数据库。
- 控制台列表没做分页，日志多了输出会很长。
- 没有 JUnit，只有自定义断言脚本，不利于持续集成。
- Swing 界面只做了核心功能，输入校验和国际化都没做。

如果继续做，我可能会先把密码哈希和 JUnit 补上，再考虑把 Web 视图（Servlet + JSP）也接进来，验证一下 MVC 的第三种视图。

## 最后

这个项目从一行 `main` 开始，经过 20 次迭代，最后变成 72 个类、约 6300 行代码、34 页结题报告、两张 UML 和一套 65 项自检脚本。过程里改得最多的不是功能，而是**结构**：把 `main` 拆成类，把类拆成层，把层拆成接口，再把重复的逻辑抽成模式和工具。

如果也在做类似的课设，我的建议是：别急着堆功能，先把"返回值、异常、状态"统一，再谈分层和模式。前者决定代码能不能维护，后者决定代码能不能扩展。

（完）
