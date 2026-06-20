/**
 * Gerenciamento de tema (Light/Dark)
 */
const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('lmstudio_theme') || 'dark';
        this.setTheme(savedTheme);
        
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            this.setTheme(next);
        });
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('lmstudio_theme', theme);
        
        const btn = document.getElementById('themeToggle');
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
    },

    getCurrent() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    }
};