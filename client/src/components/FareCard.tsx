import React from 'react';
import { Car, Bike, Info } from 'lucide-react';

interface FareEstimate {
  platform: 'ola' | 'rapido' | 'uber';
  vehicleType: string;
  price: number;
  currency: string;
  eta?: string;
  source: 'live' | 'estimate' | 'cached' | 'api' | 'scraped';
}

interface FareCardProps {
  estimate: FareEstimate;
}

export const FareCard: React.FC<FareCardProps> = ({ estimate }) => {
  const getIcon = () => {
    if (estimate.vehicleType.toLowerCase().includes('bike') || estimate.vehicleType.toLowerCase().includes('auto')) {
      return <Bike className="w-6 h-6" />;
    }
    return <Car className="w-6 h-6" />;
  };

  const getPlatformConfig = () => {
    switch (estimate.platform) {
      case 'ola': return {
        accent: 'border-l-[#1DBF73]', // Ola Green
        bg: 'bg-white',
        iconBg: 'bg-[#1DBF73]/10',
        iconColor: 'text-[#1DBF73]'
      };
      case 'rapido': return {
        accent: 'border-l-[#FFD700]', // Rapido Yellow
        bg: 'bg-white',
        iconBg: 'bg-[#FFD700]/10',
        iconColor: 'text-[#FFD700]'
      }; 
      case 'uber': return {
        accent: 'border-l-black',
        bg: 'bg-white',
        iconBg: 'bg-gray-100',
        iconColor: 'text-black'
      };
      default: return {
        accent: 'border-l-gray-200',
        bg: 'bg-white',
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-500'
      };
    }
  };

  const config = getPlatformConfig();

  const getSourceBadge = () => {
      // User requested to remove the estimate label and "don't mention anything"
      // We will only show a "LIVE" badge if the data is confirmed real/scraped, otherwise nothing.
      const isLive = estimate.source === 'live' || estimate.source === 'scraped';
      
      if (!isLive) return null;

      return (
          <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold bg-green-100 text-green-700 border border-green-200">
              Live
          </span>
      );
  };

  return (
    <div className={`p-4 rounded-xl border border-gray-100 shadow flex items-center justify-between transition-all duration-300 ease-in-out hover:shadow-md hover:-translate-y-0.5 bg-white ${config.accent} border-l-4 group`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-[8px] ${config.iconBg} ${config.iconColor} transition-colors group-hover:bg-opacity-20`}>
          {getIcon()}
        </div>
        <div>
          <div className="flex items-center gap-2">
              <h3 className="font-bold capitalize text-lg leading-tight text-[#333333]">{estimate.platform}</h3>
              {getSourceBadge()}
          </div>
          <p className="text-sm font-medium text-[#666666]">{estimate.vehicleType}</p>
          {estimate.eta && <p className="text-xs mt-1 flex items-center gap-1 text-[#666666]"><Info size={12}/> {estimate.eta}</p>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-[#333333]">
          {estimate.currency === 'INR' ? '₹' : estimate.currency} {estimate.price}
        </div>
        <div className="text-xs text-[#666666] font-medium mt-1">
            Best Price
        </div>
      </div>
    </div>
  );
};
