Component({
  properties: {
    data: { type: Object, value: {} } // { tagName: count, ... }
  },
  observers: {
    'data': function(obj) {
      if (!obj || typeof obj !== 'object') return
      const entries = Object.entries(obj)
      if (entries.length === 0) { this.setData({ tags: [] }); return }

      const max = Math.max(...entries.map(e => e[1]))
      const tags = entries
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => {
          const ratio = max > 0 ? count / max : 0
          const size = ratio > 0.7 ? 30 : ratio > 0.4 ? 26 : 22
          const level = ratio > 0.7 ? 'high' : ratio > 0.4 ? 'medium' : 'low'
          return { name, count, size, level }
        })

      this.setData({ tags })
    }
  },
  data: { tags: [] },
  methods: {
    onTagTap(e) {
      this.triggerEvent('tagtap', { name: e.currentTarget.dataset.name })
    }
  }
})
