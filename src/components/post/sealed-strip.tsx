import React from "react";

export function SealedStrip({
	text = "加密图片",
	durationSec = 24,
	repeats = 12,
	heightPx = 20,
	textSizeClass = "text-[10px] font-bold text-zinc-900 tracking-widest",
	separatorSizeClass = "text-lg font-bold text-zinc-900",
}: {
	text?: string;
	durationSec?: number;
	repeats?: number;
	heightPx?: number;
	textSizeClass?: string;
	separatorSizeClass?: string;
}) {
	const renderSequence = (keyPrefix: string) => (
		<>
			{Array.from({ length: repeats }).map((_, i) => (
				<div key={`${keyPrefix}-${i}`} className="flex items-center gap-0.1">
					<span className={textSizeClass}>{text}</span>
					<span className={separatorSizeClass}>|</span>
				</div>
			))}
		</>
	);
	return (
		<div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
			<div
				className="absolute bg-yellow-400 dark:bg-yellow-500 relative"
				style={{
					top: '50%',
					left: '-50%',
					width: '200%',
					height: `${heightPx}px`,
					transform: 'translateY(-50%) rotate(-25deg)',
					transformOrigin: 'center',
					boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
					zIndex: 2,
				}}
			>
				<div className="absolute inset-0 overflow-hidden flex items-center">
					<div
						className="flex items-center gap-0.1 whitespace-nowrap"
						style={{
							animation: `scrollText ${durationSec}s linear infinite`,
							willChange: 'transform',
						}}
					>
						<span className={separatorSizeClass}>|</span>
						{renderSequence('a')}
						{renderSequence('b')}
					</div>
				</div>
			</div>
			<div
				className="absolute bg-yellow-400 dark:bg-yellow-500 relative"
				style={{
					top: '50%',
					left: '-50%',
					width: '200%',
					height: `${heightPx}px`,
					transform: 'translateY(-50%) rotate(45deg)',
					transformOrigin: 'center',
					boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
					opacity: 0.95,
					zIndex: 1,
				}}
			>
				<div className="absolute inset-0 overflow-hidden flex items-center">
					<div
						className="flex items-center gap-0.1 whitespace-nowrap"
						style={{
							animation: `scrollText ${durationSec}s linear infinite`,
							willChange: 'transform',
							animationDirection: 'reverse',
						}}
					>
						<span className={separatorSizeClass}>|</span>
						{renderSequence('c')}
						{renderSequence('d')}
					</div>
				</div>
			</div>
		</div>
	);
}


