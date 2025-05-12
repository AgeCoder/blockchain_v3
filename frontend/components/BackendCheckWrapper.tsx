"use client";

import { useEffect, useRef, useState } from "react";
import Footer from "./Footer";
import { Navbar } from "./navbar";

export default function BackendCheckWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isBackendReady, setIsBackendReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const isMounted = useRef(true);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Function to check backend health
    const checkBackendHealth = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/health`, {
                method: "GET",
                cache: "no-store",
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === "healthy") {
                    setIsBackendReady(true);
                    setError(null);
                    return true;
                }
                throw new Error("Backend not healthy");
            }
            throw new Error("Backend request failed");
        } catch (err) {
            setError("Establishing secure connection...");
            return false;
        }
    };

    // Retry mechanism
    useEffect(() => {
        const maxRetries = 10;
        const retryInterval = 3000;
        let retryCount = 0;

        const tryConnect = async () => {
            if (!isMounted.current) return;

            // Update progress
            setProgress(Math.min(100, (retryCount / maxRetries) * 100));

            if (await checkBackendHealth()) return; // Stop if connected

            if (retryCount < maxRetries) {
                retryCount++;
                timeoutRef.current = setTimeout(tryConnect, retryInterval);
            } else {
                setError("Connection timeout. Please check your network and try again.");
            }
        };

        tryConnect();

        // Cleanup
        return () => {
            isMounted.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Render loading UI if backend is not ready
    if (!isBackendReady) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 p-4">
                <div className="w-full max-w-md mx-auto">
                    <div className="bg-gray-800 bg-opacity-80 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-gray-700 border-opacity-50 overflow-hidden">
                        {/* Connection visualization */}
                        <div className="relative mb-8">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-64 w-64 rounded-full bg-blue-500 opacity-10 blur-xl animate-pulse"></div>
                            </div>

                            <div className="relative flex flex-col items-center">
                                {/* Server visualization */}
                                <div className="relative z-10">
                                    <div className="h-24 w-40 bg-gray-700 rounded-lg flex items-center justify-center shadow-inner border border-gray-600">
                                        <div className="flex space-x-1">
                                            {[1, 2, 3].map((i) => (
                                                <div
                                                    key={i}
                                                    className={`h-2 w-2 rounded-full ${error && error.includes('timeout') ? 'bg-red-400' : 'bg-blue-400'} animate-pulse`}
                                                    style={{ animationDelay: `${i * 0.2}s` }}
                                                ></div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="h-2 w-16 bg-gray-600 mx-auto mt-1 rounded-b"></div>
                                </div>

                                {/* Connection line */}
                                <div className="h-16 w-1 bg-gradient-to-b from-blue-400 to-transparent relative my-2">
                                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-400 rounded-full animate-bounce"></div>
                                </div>

                                {/* Client visualization */}
                                <div className="relative z-10">
                                    <div className="h-16 w-16 bg-gray-700 rounded-full flex items-center justify-center shadow-inner border border-gray-600">
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                                            <svg
                                                className="h-5 w-5 text-white animate-spin"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status text */}
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-semibold text-white mb-2">
                                {error || "Securing connection to server..."}
                            </h2>
                            <p className="text-gray-400 text-sm">
                                {error
                                    ? "Our servers are currently busy. Please try again later."
                                    : "Establishing encrypted tunnel for secure communication"}
                            </p>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-6">
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>0%</span>
                                <span>{progress.toFixed(0)}%</span>
                                <span>100%</span>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col space-y-3">
                            {error && (
                                <>
                                    <button
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all duration-300 transform hover:scale-[1.02] active:scale-95"
                                        onClick={() => window.location.reload()}
                                    >
                                        Try Again
                                    </button>
                                    <p className="text-gray-400 text-sm w-full text-center">
                                        It takes a few seconds to establish a connection
                                    </p>

                                </>
                            )}

                            {!error && (
                                <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm">
                                    <svg className="h-4 w-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                    <span>Attempting connection {progress > 0 ? `(${progress.toFixed(0)}%)` : ''}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer note */}
                    <div className="mt-6 text-center text-gray-500 text-xs">
                        <p>Secure TLS 1.3 connection • Encrypted data transfer</p>
                    </div>
                </div>
            </div>
        );
    }

    return <>
        <Navbar />
        {children}
        <Footer />
    </>;
}