export function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            document.querySelector('.tab.active').classList.remove('active');
            const activeContent = document.querySelector('.tab-content.active');
            if (activeContent) activeContent.classList.remove('active');

            tab.classList.add('active');
            const newContent = document.getElementById(`${tab.dataset.tab}-tab`);
            if (newContent) newContent.classList.add('active');
        });
    });
}
