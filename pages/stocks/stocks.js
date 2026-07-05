const { searchStock, getWatchlist, addToWatchlist, removeFromWatchlist, getWatchlistWithQuotes, isInWatchlist } = require('../../utils/stockSearch')

Page({
  data: {
    watchlist: [],
    searchResults: [],
    searchKeyword: '',
    isSearching: false,
    showSearch: false,
    loading: false,
    refreshing: false,
    tradedStocks: []
  },

  onLoad() {
    this.loadWatchlist()
    this.loadTradedStocks()
  },

  onShow() {
    this.refreshQuotes()
  },

  onPullDownRefresh() {
    this.refreshQuotes().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadTradedStocks() {
    const storage = require('../../utils/storage')
    const reviews = storage.getReviews().filter(r => !r.isDraft)
    const stockCount = {}
    const lastTrade = {}
    reviews.forEach(r => {
      r.formData.buyList.forEach(b => {
        if (b.stock) {
          stockCount[b.stock] = (stockCount[b.stock] || 0) + 1
          if (!lastTrade[b.stock] || r.timestamp > lastTrade[b.stock].time) {
            lastTrade[b.stock] = { time: r.timestamp, direction: '买入', date: r.date }
          }
        }
      })
      r.formData.sellList.forEach(s => {
        if (s.stock) {
          stockCount[s.stock] = (stockCount[s.stock] || 0) + 1
          if (!lastTrade[s.stock] || r.timestamp > lastTrade[s.stock].time) {
            lastTrade[s.stock] = { time: s.timestamp, direction: '卖出', date: r.date }
          }
        }
      })
    })
    const tradedStocks = Object.entries(stockCount)
      .map(([name, count]) => ({
        name, count,
        isFrequent: count >= 3,
        lastDirection: lastTrade[name] ? lastTrade[name].direction : '',
        lastDate: lastTrade[name] ? lastTrade[name].date : ''
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    this.setData({ tradedStocks })
  },

  async loadWatchlist() {
    const watchlist = getWatchlist()
    this.setData({ watchlist })
  },

  async refreshQuotes() {
    this.setData({ refreshing: true })
    try {
      const watchlist = await getWatchlistWithQuotes()
      this.setData({ watchlist, refreshing: false })
    } catch (e) {
      this.setData({ refreshing: false })
    }
  },

  toggleSearch() {
    this.setData({
      showSearch: !this.data.showSearch,
      searchResults: [],
      searchKeyword: ''
    })
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 防抖搜索
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (!keyword.trim()) {
      this.setData({ searchResults: [], isSearching: false })
      return
    }

    this._searchTimer = setTimeout(() => {
      this.doSearch(keyword)
    }, 300)
  },

  async doSearch(keyword) {
    this.setData({ isSearching: true })
    try {
      const results = await searchStock(keyword)
      // 标记是否已在自选
      const marked = results.map(r => ({
        ...r,
        inWatchlist: isInWatchlist(r.code)
      }))
      this.setData({ searchResults: marked, isSearching: false })
    } catch (e) {
      this.setData({ searchResults: [], isSearching: false })
    }
  },

  addStock(e) {
    const stock = e.currentTarget.dataset.stock
    if (!stock) return

    const added = addToWatchlist(stock)
    if (added) {
      wx.showToast({ title: `已添加 ${stock.name}`, icon: 'success' })
      // 更新搜索结果中的标记
      const results = this.data.searchResults.map(r => ({
        ...r,
        inWatchlist: r.code === stock.code ? true : r.inWatchlist
      }))
      this.setData({ searchResults: results })
      this.loadWatchlist()
      this.refreshQuotes()
    } else {
      wx.showToast({ title: '已在自选中', icon: 'none' })
    }
  },

  removeStock(e) {
    const code = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '移除自选',
      content: `确定要将 ${name || code} 从自选中移除吗？`,
      success: (res) => {
        if (res.confirm) {
          removeFromWatchlist(code)
          wx.showToast({ title: '已移除', icon: 'success' })
          this.loadWatchlist()
          // 更新搜索结果
          if (this.data.searchResults.length > 0) {
            const results = this.data.searchResults.map(r => ({
              ...r,
              inWatchlist: r.code === code ? false : r.inWatchlist
            }))
            this.setData({ searchResults: results })
          }
        }
      }
    })
  },

  viewStock(e) {
    const stock = e.currentTarget.dataset.stock
    if (!stock || !stock.quote) return
    // 可以扩展为跳转到股票详情页
    wx.showToast({
      title: `${stock.name} ${stock.quote.price}`,
      icon: 'none'
    })
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      showSearch: false
    })
  }
})
