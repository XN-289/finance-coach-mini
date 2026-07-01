Component({
  properties: {
    title: { type: String, value: '' },
    type: { type: String, value: 'bar' }, // 'bar' | 'trend' | 'ring'
    chartData: { type: Array, value: [] },
    value: { type: String, value: '0' },
    subtitle: { type: String, value: '' },
    ringColor: { type: String, value: '#e4393c' },
    ringPercent: { type: Number, value: 0 }
  }
})
