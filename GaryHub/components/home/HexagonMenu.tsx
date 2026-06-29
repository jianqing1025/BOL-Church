
import React from 'react';
import HexagonCard from '../common/HexagonCard';

interface HexagonMenuProps {
    onNavigate: (page: string) => void;
}

const HexagonMenu: React.FC<HexagonMenuProps> = ({ onNavigate }) => {
    return (
        <div className="hex-menu-container pointer-events-auto">
            <div className="hexagon-menu clear">
                <HexagonCard 
                    title="Library Hub" 
                    iconClass="fa-solid fa-photo-film" 
                    onClick={() => onNavigate('gallery')} 
                />
                <HexagonCard 
                    title="Photo" 
                    iconClass="fa-solid fa-camera" 
                    onClick={() => onNavigate('photos')} 
                />
                <HexagonCard 
                    title="Video" 
                    iconClass="fa-solid fa-film" 
                    onClick={() => onNavigate('videos')} 
                />
                <HexagonCard
                    title="CelineHomes"
                    iconClass="fa-solid fa-house"
                    onClick={() => window.open('https://homes.garylab.cc', '_blank')}
                />
                <HexagonCard 
                    title="KineLab" 
                    iconClass="fa-solid fa-chart-line" 
                    onClick={() => window.open('https://kinelab.xyz', '_blank')} 
                />
                <HexagonCard 
                    title="Slideshow" 
                    iconClass="fa-solid fa-circle-play" 
                    onClick={() => window.open('https://show.garylab.cc', '_blank')} 
                />
                <HexagonCard 
                    title="continue" 
                    iconClass="fa-solid fa-ellipsis" 
                    onClick={() => {}} 
                />
            </div>
        </div>
    );
};

export default HexagonMenu;
