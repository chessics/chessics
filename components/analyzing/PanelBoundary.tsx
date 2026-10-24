'use client'

import { Component, type ReactNode } from 'react'

export default class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[analyzing] puzzle panel hidden after an error', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
