<script setup lang="ts">
const contactLinks = [
  {
    label: 'GitHub 仓库',
    icon: 'i-lucide-github',
    href: 'https://github.com/Hydroline/hydroline-hydcraft-services',
  },
]
</script>

<template>
  <div class="mx-auto w-full max-w-4xl p-8">
    <section
      class="relative mb-10 rounded-3xl bg-linear-to-br from-slate-200 via-primary-500 to-slate-700 px-6 py-10 text-white shadow-xl"
    >
      <div class="absolute inset-0 opacity-50">
        <div
          class="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/40 blur-3xl"
        />
      </div>
      <div class="relative z-10 mx-auto flex max-w-3xl flex-col text-center">
        <p class="text-sm uppercase tracking-[0.4em] text-white/70 mb-2">
          关于
        </p>
        <h1 class="text-4xl font-semibold leading-tight mb-4">
          Hydroline HydCraft
        </h1>
        <p class="text-sm text-white/80">
          Hydroline HydCraft 是基于氢气工艺服务器自身需求进行的定制开发<br />
          Hydroline 是 Hydrlab 团队和 AurLemon 开发的、为 Minecraft
          服务器提供信息聚合服务的代码模板
        </p>
      </div>
    </section>

    <div class="space-y-14 md:px-1 mb-10">
      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-sm uppercase tracking-wide text-slate-500/70 dark:text-slate-400/70"
            >
              ORIGIN
            </p>
            <h2
              class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              起源
            </h2>
          </div>
        </div>
        <div
          class="space-y-3 text-slate-700 dark:text-slate-300 tracking-wide text-justify"
        >
          <p>
            Hydroline 的雏形最初出现于 2023 年 7 月，以“数字氢气”（Digital
            HydCraft）的形式嵌入在服务器 Wiki
            页面内，可惜那会搞了一个月后便草草收场了。
          </p>
          <p>
            两年后的现在，2025 年 10
            月底，我们决定重拾数字氢气的夙愿，结合服务器的实际需求进行开发。铁路数据的信息聚合、玩家账户统一认证、服务器状态监控、企业登记功能、仿真地图都是
            Minecraft 城建、铁建类服务器的刚需功能。
          </p>
          <p>
            但是如此多的功能，其内部的耦合关系和技术细节不亚于从头构建一个中大厂的应用项目，我们一群高中生和大学生，甚至还有非计算机专业的成员，就算在
            AI 加持下，也捉襟见肘。但无论如何，迈出第一步是必然的。就这样，在
            2025 年 11 月初，Hydroline 直接结合氢气工艺服务器的应用场景，进行
            MVP 阶段开发。第一个开发 Commit 从这天起被提交了。
          </p>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-sm uppercase tracking-wide text-slate-500/70 dark:text-slate-400/70"
            >
              EXPERIENCES
            </p>
            <h2
              class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              历程
            </h2>
          </div>
        </div>
        <div
          class="space-y-3 text-slate-700 dark:text-slate-300 tracking-wide text-justify"
        >
          <p>
            Hydroline HydCraft
            目前仍在持续迭代，感谢氢气工艺服务器内参与测试的各位玩家。
          </p>
          <p>
            欢迎诸位玩家和开发者前来 GitHub 仓库查看代码，提出 Issue 和
            PR。或是直接提出项目的优化方向。也欢迎广大 Minecraft
            玩家和服务器管理员提出和分享自己的意见。
          </p>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-sm uppercase tracking-wide text-slate-500/70 dark:text-slate-400/70"
            >
              TECH STACK
            </p>
            <h2
              class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              技术栈
            </h2>
          </div>
        </div>
        <div
          class="space-y-3 text-slate-700 dark:text-slate-300 tracking-wide text-justify"
        >
          <p>
            我们选择 TypeScript 作为开发语言，在项目结构上，选择了 Vue 3 + Nest
            + TS 的组合。Nest 是 Node
            后端开发生态中较为成熟的框架，拥有良好的模块化设计和丰富的装饰器支持，非常适合构建复杂的后端服务。
          </p>
          <p>
            在部署上，结合腾讯云 EdgeOne、Cloudflare CDN、Cloudflare Workers
            等服务，尽量在低成本内，为站点服务构建最优秀的访问体验。
          </p>
          <p>
            服务器的登录插件 AuthMe 数据库和权限组插件 LuckPerms
            数据库都已被剥离到单独的服务器上，方便 Hydroline 直接构建 Pool
            进行访问。同时，Hydroline 还开发了 Beacon 插件，用于在 Minecraft
            服务器内实时传递消息。
          </p>
          <p>
            在 UI 设计上，Hydroline 以简约和淡色为理念，搭配 Nuxt UI 组件库和
            Motion
            动效库，为用户构建最佳的用户体验。团队也一直在探索，如何将现代 Web
            与 Minecraft 的像素风格融合在一起。
          </p>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-sm uppercase tracking-wide text-slate-500/70 dark:text-slate-400/70"
            >
              DEVELOPERS
            </p>
            <h2
              class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              开发者
            </h2>
          </div>
        </div>
        <div
          class="space-y-3 text-slate-700 dark:text-slate-300 tracking-wide text-justify"
        >
          <div class="flex flex-col gap-2">
            <div>
              <img
                src="@/assets/resources/aurlemon_logo.jpg"
                class="w-16 h-16 block rounded-full border border-slate-400"
              />
            </div>
            <div>
              <div class="flex gap-3 gap-y-0 flex-wrap items-end">
                <span class="text-xl font-semibold">AurLemon (Lin Junle)</span>
                <span class="text-xs text-slate-500"
                  >项目发起人、Hydrlab 团队负责人、氢气工艺服务器服主、Hydroline
                  HydCraft 站长</span
                >
              </div>
              <div class="mt-1">
                19 岁，福建福州人，福建船政交通职业学院（2024 —
                2026）大二生。<br />
                负责 UI 设计、前后端开发、架构设计、部署运维、Minecraft
                服务端接入等工作。你以为是我想全栈吗？因为根本就没人帮我。
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-sm uppercase tracking-wide text-slate-500/70 dark:text-slate-400/70"
            >
              LICENSE
            </p>
            <h2
              class="mt-1 text-2xl font-semibold text-slate-900 dark:text-white"
            >
              协议
            </h2>
          </div>
        </div>
        <div
          class="space-y-3 text-slate-700 dark:text-slate-300 tracking-wide text-justify"
        >
          <p>
            项目代码遵照私有协议进行发布，协议详情请参照仓库代码内的 LICENSE
            声明。未经许可禁止商用和二次发布。
          </p>
          <p>
            站内的用户创作文本在没有特别声明的情况下，以 CC BY-NC-SA 4.0
            协议发布。
          </p>
          <p>
            Minecraft 服务器内的建筑版权归氢气工艺服务器及其各自的创作者所有。
          </p>
        </div>
      </section>
    </div>

    <section>
      <div class="flex flex-wrap justify-center gap-3">
        <UTooltip
          v-for="link in contactLinks"
          :key="link.href"
          :text="link.label"
        >
          <a
            :href="link.href"
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-2 rounded-full border border-slate-200 p-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200/50 dark:border-slate-700 dark:text-slate-200"
          >
            <UIcon :name="link.icon" class="text-lg" />
          </a>
        </UTooltip>
      </div>
    </section>
  </div>
</template>
