
import React, { useState, useEffect } from 'react';
import SectionHeader from '../common/SectionHeader';
import { TimeLeft } from '../../types';

const CounterBlock = ({ value, label }: { value: number, label: string }) => {
  const padded = value.toString().padStart(value >= 1000 ? 4 : (value >= 100 ? 3 : 2), '0'); const digits = padded.split('');
  return (
    <div className="counter-block">
      <div className={`counter ${value >= 1000 ? 'with-thousands' : (value >= 100 ? 'with-hundreds' : '')}`}>{digits.map((d, i) => (<div key={i} className={`number show`} style={{ left: `${(100/digits.length) * i}%`, width: `${96/digits.length}%` }}>{d}</div>))}</div>
      <div className="counter-caption">{label}</div>
    </div>
  );
};

const CountdownSection = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    const startDate = new Date(targetDate).getTime();
    if (isNaN(startDate)) return; 
    
    const timer = setInterval(() => { 
        const now = new Date().getTime();
        const distance = now - startDate; 
        
        setTimeLeft({ 
            days: Math.floor(distance / 86400000), 
            hours: Math.floor((distance % 86400000) / 3600000), 
            minutes: Math.floor((distance % 3600000) / 60000), 
            seconds: Math.floor((distance % 60000) / 1000) 
        }); 
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <section className="bg-brand-dark py-24 bg-fixed bg-cover relative" style={{ backgroundImage: `url(https://res.cloudinary.com/drtve7qyt/image/upload/v1765366090/YX-Snag_2_knku43.jpg)` }}><div className="absolute inset-0 bg-black/60"></div><div className="container mx-auto px-4 relative z-10 text-center"><SectionHeader title="We Have Been In Love For" subtitle="Cherishing every moment" light={true} /><div className="counter-group"><CounterBlock value={timeLeft.days} label="Days" /><CounterBlock value={timeLeft.hours} label="Hours" /><CounterBlock value={timeLeft.minutes} label="Minutes" /><CounterBlock value={timeLeft.seconds} label="Seconds" /></div></div></section>
  );
};

export default CountdownSection;
