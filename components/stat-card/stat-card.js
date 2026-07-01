Component({
  properties: {
    icon: { type: String, value: '' },
    value: { type: null, value: '0' }, // 接受 String 或 Number
    unit: { type: String, value: '' },
    label: { type: String, value: '' },
    badge: { type: String, value: '' },
    size: { type: String, value: '' }, // 'mini'
    trend: { type: String, value: '' }  // 'up' | 'down'
  },
  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
