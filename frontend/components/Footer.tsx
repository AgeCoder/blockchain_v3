import React from 'react'

export default function Footer() {
    return (
        <footer className="border-t py-6 md:py-0">
            <div className="container flex flex-col md:h-16 items-center justify-between gap-4 md:flex-row">
                <p className="text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} ANTIG. All rights reserved.
                </p>
                <p className="text-sm text-muted-foreground">
                    Network Status: <span className="text-green-500">Connected</span>
                </p>
            </div>
        </footer>
    )
}
