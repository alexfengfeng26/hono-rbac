(function () {
  // 多主题列表（需与 style.css daisyUI themes 保持一致）
  var THEMES = ['light', 'dark', 'corporate', 'cupcake', 'nord', 'synthwave']
  window.RBAC_THEMES = THEMES

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('rbac-theme', theme)
    } catch (e) {}
  }

  // 循环切换主题（导航栏按钮 / 命令面板共用）
  window.rbacCycleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || THEMES[0]
    var i = THEMES.indexOf(cur)
    if (i < 0) i = 0
    apply(THEMES[(i + 1) % THEMES.length])
  }

  // 主题初始化：localStorage 优先，其次系统偏好（避免 FOUC，置于 head 同步执行）
  var saved = null
  try {
    saved = localStorage.getItem('rbac-theme')
  } catch (e) {}
  var prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  var theme = saved || (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)

  // 侧栏折叠状态：同步恢复，避免闪屏
  var sb = null
  try {
    sb = localStorage.getItem('rbac-sidebar')
  } catch (e) {}
  if (sb === 'collapsed') {
    document.documentElement.setAttribute('data-sidebar', 'collapsed')
  } else {
    document.documentElement.setAttribute('data-sidebar', 'expanded')
  }

  // 主题切换按钮（data-theme-toggle）
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null
    if (!btn) return
    window.rbacCycleTheme()
  })

  // 侧栏折叠按钮（data-sidebar-toggle）
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-sidebar-toggle]') : null
    if (!btn) return
    var collapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed'
    var next = collapsed ? 'expanded' : 'collapsed'
    if (next === 'collapsed') {
      document.documentElement.setAttribute('data-sidebar', 'collapsed')
    } else {
      document.documentElement.setAttribute('data-sidebar', 'expanded')
    }
    try {
      localStorage.setItem('rbac-sidebar', next)
    } catch (e2) {}
  })
})()
