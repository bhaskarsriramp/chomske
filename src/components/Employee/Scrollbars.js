import { useEffect } from 'react';
import './ScrollAnimation.css';

const ScrollAnimation = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      const container = document.querySelector('.scroll-container');
      const block = document.createElement('div');
      block.classList.add('scroll-block');
      container.appendChild(block);
      setTimeout(() => container.removeChild(block), 4000); // Remove block after animation
    }, 1000);

    return () => clearInterval(interval); // Clean up the interval when the component is unmounted
  }, []);

  return (
    <div className="scroll-container">
    </div>
  );
};

export default ScrollAnimation;
