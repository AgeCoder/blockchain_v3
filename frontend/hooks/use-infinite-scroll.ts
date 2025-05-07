'use client'
import { useEffect, useRef } from "react"

interface InfiniteScrollOptions {
    isLoading: boolean
}

export function useInfiniteScroll(callback: () => void, options: InfiniteScrollOptions) {
    const { isLoading } = options
    const observerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isLoading) {
                    callback()
                }
            },
            { threshold: 0.1 }
        )

        if (observerRef.current) {
            observer.observe(observerRef.current)
        }

        return () => {
            if (observerRef.current) {
                observer.unobserve(observerRef.current)
            }
        }
    }, [callback, isLoading])

    return { observerRef }
}