import Image from 'next/image';
import { cn } from '@/lib/cn';

type BrandProps = {
  className?: string;
  priority?: boolean;
  variant?: 'lockup' | 'mark' | 'wordmark';
};

const assets = {
  lockup: { src: '/brand/genebark-lockup-white.png', width: 1705, height: 405 },
  mark: { src: '/brand/genebark-mark-white.png', width: 1050, height: 970 },
  wordmark: { src: '/brand/genebark-wordmark-white.png', width: 1290, height: 370 },
} as const;

export function Brand({ className, priority = false, variant = 'lockup' }: BrandProps) {
  const asset = assets[variant];

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt="Genebark"
      priority={priority}
      className={cn('h-auto object-contain', className)}
    />
  );
}
