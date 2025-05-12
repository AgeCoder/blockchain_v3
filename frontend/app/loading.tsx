"use client";

import { useEffect, useRef, useState } from "react";

export default function BlockchainLoadingScreen() {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("Initializing secure session...");
    const animationRef = useRef<number>(0);
    const progressInterval = useRef<NodeJS.Timeout>(null);

    // Simulate loading progress
    useEffect(() => {
        const steps = [
            { progress: 15, status: "Connecting to blockchain network..." },
            { progress: 30, status: "Verifying node synchronization..." },
            { progress: 50, status: "Establishing secure wallet tunnel..." },
            { progress: 70, status: "Loading cryptographic keys..." },
            { progress: 85, status: "Finalizing security checks..." },
            { progress: 95, status: "Almost ready..." },
        ];

        let currentStep = 0;
        const speed = 100 + Math.random() * 50; // Variable speed for realism

        progressInterval.current = setInterval(() => {
            setProgress((prev) => {
                const nextProgress = prev + 0.5;

                // Update status text at specific intervals
                if (currentStep < steps.length && nextProgress >= steps[currentStep].progress) {
                    setStatus(steps[currentStep].status);
                    currentStep++;
                }

                return nextProgress > 100 ? 100 : nextProgress;
            });
        }, speed);

        return () => {
            if (progressInterval.current) clearInterval(progressInterval.current);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    // Blockchain particle animation
    useEffect(() => {
        const canvas = document.getElementById('blockchainCanvas') as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const particles: Particle[] = [];
        const particleCount = Math.floor(canvas.width * canvas.height / 5000);

        class Particle {
            x: number;
            y: number;
            size: number;
            speedX: number;
            speedY: number;
            color: string;

            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 0.5;
                this.speedX = Math.random() * 1 - 0.5;
                this.speedY = Math.random() * 1 - 0.5;
                this.color = `hsl(${Math.random() * 60 + 180}, 80%, 60%)`;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
                if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw connecting lines
            for (let a = 0; a < particles.length; a++) {
                for (let b = a; b < particles.length; b++) {
                    const dx = particles[a].x - particles[b].x;
                    const dy = particles[a].y - particles[b].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        ctx.strokeStyle = `rgba(100, 200, 255, ${1 - distance / 100})`;
                        ctx.lineWidth = 0.3;
                        ctx.beginPath();
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
                particles[a].update();
                particles[a].draw();
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <div className="relative flex items-center justify-center min-h-screen bg-gray-900 overflow-hidden">
            {/* Animated blockchain background */}
            <canvas
                id="blockchainCanvas"
                className="absolute inset-0 w-full h-full opacity-20"
            ></canvas>

            {/* Main loading card */}
            <div className="relative z-10 w-full max-w-md px-6 py-8 mx-4 bg-gray-800 bg-opacity-80 backdrop-blur-lg rounded-xl border border-gray-700 shadow-2xl">
                {/* Wallet logo */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg">
                            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
                                <path d="M3 6H21V18H3V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M7 14H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="absolute -inset-2 border-2 border-cyan-400 rounded-xl opacity-60 animate-ping-slow"></div>
                    </div>
                </div>

                {/* Progress indicator */}
                <div className="mb-6">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>Loading Wallet</span>
                        <span>{Math.min(100, Math.floor(progress))}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="h-full w-8 bg-white opacity-30 float-right animate-pulse"></div>
                        </div>
                    </div>
                </div>

                {/* Status message */}
                <div className="text-center mb-8">
                    <h2 className="text-xl font-semibold text-white mb-2">
                        {status}
                    </h2>
                    <p className="text-gray-400 text-sm">
                        Secured by blockchain technology • TLS 1.3 encrypted
                    </p>
                </div>

                {/* Animated blocks */}
                <div className="flex justify-center space-x-2 mb-8">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-3 w-3 bg-cyan-400 rounded-sm opacity-50"
                            style={{
                                animation: `pulse 1.5s ease-in-out infinite`,
                                animationDelay: `${i * 0.2}s`
                            }}
                        ></div>
                    ))}
                </div>

                {/* Blockchain verification */}
                <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center space-x-2 text-sm text-cyan-400">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Verifying last block: #{Math.floor(Math.random() * 1000000).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Global styles */}
            <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes ping-slow {
          0% { transform: scale(0.95); opacity: 0.8; }
          70%, 100% { transform: scale(1.3); opacity: 0; }
        }
        .animate-ping-slow {
          animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
        </div>
    );
}