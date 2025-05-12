"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Shield, Wallet, Database, Lock, Bolt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const animationRef = useRef<number>(0);
  const [isHovered, setIsHovered] = useState<number | null>(null);


  // Enhanced blockchain animation
  useEffect(() => {
    const canvas = document.getElementById('blockchainCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles: Particle[] = [];
    const particleCount = Math.floor(canvas.width * canvas.height / 3000);

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      baseX: number;
      baseY: number;
      density: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
        this.color = `hsl(${Math.random() * 60 + 180}, 80%, 60%)`;
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = Math.random() * 30 + 1;
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

      // Draw connecting lines with improved performance
      for (let a = 0; a < particles.length; a++) {
        for (let b = a; b < Math.min(a + 20, particles.length); b++) {
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
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden ">
      {/* Animated blockchain background */}
      <canvas
        id="blockchainCanvas"
        className="absolute inset-0 w-full h-full opacity-10"
      ></canvas>


      {/* <div className="absolute inset-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute  opacity-20"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              fontSize: `${Math.random() * 20 + 10}px`,
              animation: `float ${Math.random() * 10 + 10}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`
            }}
          >
            <Bolt />
          </div>
        ))}
      </div> */}

      <div className="container mx-auto px-4 py-16 relative z-10">
        {/* Hero section */}
        <div className="flex flex-col items-center text-center space-y-6 mb-20">
          <div className="relative">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg">
              ANTIG Blockchain
            </h1>
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 h-1 w-32 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"></div>
          </div>

          <p className="max-w-2xl text-lg ">
            Your secure gateway to decentralized finance. Manage assets, explore blocks, and transact with confidence.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <Button
              size="lg"
              className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 shadow-lg"
              onClick={() => router.push('/dashboard')}
            >
              Launch Wallet
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full "
              onClick={() => router.push('/explorer')}
            >
              Explore Blockchain
            </Button>
          </div>


        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              title: "Secure Wallet",
              icon: <Wallet className="h-6 w-6 text-blue-400" />,
              desc: "Full control of your assets",
              content: "Non-custodial wallet with military-grade encryption. Your keys, your coins.",
              href: "/dashboard",
              gradient: "from-blue-600/20 to-blue-800/10"
            },
            {
              title: "Block Explorer",
              icon: <Database className="h-6 w-6 text-purple-400" />,
              desc: "Transparent blockchain access",
              content: "Inspect transactions, blocks, and network activity in real-time.",
              href: "/explorer",
              gradient: "from-purple-600/20 to-purple-800/10"
            },
            // {
            //   title: "Military Security",
            //   icon: <Shield className="h-6 w-6 text-green-400" />,
            //   desc: "Enterprise-grade protection",
            //   content: "Multi-layer security with hardware wallet support and 2FA options.",
            //   href: "/security",
            //   gradient: "from-green-600/20 to-green-800/10"
            // },
            {
              title: "Private Transactions",
              icon: <Lock className="h-6 w-6 text-amber-400" />,
              desc: "Enhanced privacy features",
              content: "Optional privacy modes and coin mixing for confidential transactions.",
              href: "/transactions",
              gradient: "from-amber-600/20 to-amber-800/10"
            },
            // {
            //   title: "Market Analytics",
            //   icon: <BarChart2 className="h-6 w-6 text-cyan-400" />,
            //   desc: "Real-time market data",
            //   content: "Track prices, volumes, and market trends with advanced charting tools.",
            //   href: "/markets",
            //   gradient: "from-cyan-600/20 to-cyan-800/10"
            // },
            // {
            //   title: "ANTIG Ecosystem",
            //   icon: <Bitcoin className="h-6 w-6 text-pink-400" />,
            //   desc: "Native token utilities",
            //   content: "Stake, swap, and utilize ANTIG across our growing ecosystem.",
            //   href: "/antig",
            //   gradient: "from-pink-600/20 to-pink-800/10"
            // }
          ].map(({ title, icon, desc, content, href, gradient }, i) => (
            <Card
              key={i}
              className={`relative overflow-hidden rounded-xl border border-gray-700 hover:border-gray-600 transition-all duration-300 ${isHovered === i ? "shadow-lg transform scale-105" : "shadow-md"
                }`}
              onMouseEnter={() => setIsHovered(i)}
              onMouseLeave={() => setIsHovered(null)}
              onClick={() => router.push(href)}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-70`}></div>
              <div className="relative z-10">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-gray-800/50  backdrop-blur-sm">
                      {icon}
                    </div>
                    <div>
                      <CardTitle className="">{title}</CardTitle>
                      <CardDescription className="text-gray-400">{desc}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="">{content}</p>
                </CardContent>
                <div className="px-6 pb-4">
                  <Button variant="ghost" className="text-blue-400 hover:text-blue-300 px-0">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Stats section */}

      </div>

      {/* Global styles */}
      <style jsx global>{`
        @keyframes float {
          0% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}