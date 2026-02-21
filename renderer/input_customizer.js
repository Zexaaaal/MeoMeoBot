function setupCustomNumberInputs() {
    const inputs = document.querySelectorAll('input[type="number"]');

    inputs.forEach(input => {
        if (input.parentElement.classList.contains('custom-number-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-number-wrapper';

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const btns = document.createElement('div');
        btns.className = 'custom-spin-btns';

        const upBtn = document.createElement('div');
        upBtn.className = 'custom-spin-btn';
        upBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
        `;

        const downBtn = document.createElement('div');
        downBtn.className = 'custom-spin-btn';
        downBtn.innerHTML = `
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;

        btns.appendChild(upBtn);
        btns.appendChild(downBtn);
        wrapper.appendChild(btns);

        upBtn.addEventListener('click', () => {
            input.stepUp();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        downBtn.addEventListener('click', () => {
            input.stepDown();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

const observer = new MutationObserver((mutations) => {
    setupCustomNumberInputs();
});

document.addEventListener('DOMContentLoaded', () => {
    setupCustomNumberInputs();
    observer.observe(document.body, { childList: true, subtree: true });
});
