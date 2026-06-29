
import React from 'react';

interface HexagonCardProps {
    title: string;
    iconClass: string; // Changed from LucideIcon to FontAwesome class string
    onClick: () => void;
    // Removing unneeded props from previous version (subtitle, color)
    className?: string;
}

const HexagonCard: React.FC<HexagonCardProps> = ({ title, iconClass, onClick, className = '' }) => {
    return (
        <div className={`hexagon-item ${className}`} onClick={onClick}>
            {/* Background Shape (Inner) */}
            <div className="hex-item">
                <div></div>
                <div></div>
                <div></div>
            </div>
            
            {/* Background Shape (Outer/Animation) */}
            <div className="hex-item">
                <div></div>
                <div></div>
                <div></div>
            </div>
            
            {/* Content */}
            <div className="hex-content">
                <span className="hex-content-inner">
                    <span className="icon">
                        <i className={iconClass}></i>
                    </span>
                    <span className="title">{title}</span>
                </span>
                
                {/* SVG Background Fill */}
                <svg viewBox="0 0 173.2 200" height="200" width="174" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <path d="M86.6 0L173.2 50L173.2 150L86.6 200L0 150L0 50Z" fill="#1e2530"></path>
                </svg>
            </div>
        </div>
    );
};

export default HexagonCard;
