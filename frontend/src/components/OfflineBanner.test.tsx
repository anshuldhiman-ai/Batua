import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OfflineBanner from './OfflineBanner'
import { BACKEND_STATUS_EVENT } from '@/lib/utils-finance'

const emit = (online: boolean) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(BACKEND_STATUS_EVENT, { detail: { online } }))
  })

describe('OfflineBanner', () => {
  it('shows when the backend goes offline and hides when it returns', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OfflineBanner />
      </QueryClientProvider>
    )
    expect(screen.queryByRole('alert')).toBeNull()

    emit(false)
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the Batua server")
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    emit(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
