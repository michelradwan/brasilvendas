/**
 * ==============================================================================
 * RADWAN ADS — MACOS DOCK GAUSSIAN MAGNIFICATION & SPRING ENGINE (VANILLA JS)
 * Zero Layout Shift • Pure transform3d Physics • Touch Support • Zero Jitter
 * ==============================================================================
 */

(function () {
    'use strict';

    class MacOsDockEngine {
        constructor() {
            this.navEl = document.getElementById('mobile-bottom-dock');
            this.containerEl = document.getElementById('dock-physics-container');
            if (!this.containerEl) return;

            this.items = Array.from(this.containerEl.querySelectorAll('.mobile-dock-btn'));
            if (this.items.length === 0) return;

            // Parâmetros de Magnificação Gaussiana (Desktop macOS Raycast/Apple Grade)
            this.maxMagnification = 1.75;
            this.influenceRadius = 90; // pixels
            this.isDesktop = window.innerWidth >= 768;
            this.mouseX = null;
            this.mouseY = null;
            this.isHovering = false;
            this.animFrameId = null;

            // Parâmetros do Spring (Vanilla RK4 / Euler Spring)
            this.stiffness = 380;
            this.damping = 26;
            this.mass = 1;

            // Estado Físico dos Ícones
            this.itemStates = this.items.map((btn) => {
                const iconWrapper = btn.querySelector('.mobile-dock-icon-wrapper') || btn.querySelector('.mobile-dock-icon');
                const tooltip = btn.querySelector('.dock-tooltip');
                return {
                    btn,
                    iconWrapper,
                    tooltip,
                    currentScale: 1,
                    targetScale: 1,
                    velocity: 0,
                    rect: null
                };
            });

            this.bindEvents();
            this.updateLayout();
        }

        bindEvents() {
            window.addEventListener('resize', () => {
                this.isDesktop = window.innerWidth >= 768;
                this.updateLayout();
            }, { passive: true });

            // Desktop Pointer Interactions
            this.containerEl.addEventListener('pointerenter', (e) => {
                if (e.pointerType === 'touch') return;
                this.isHovering = true;
                this.mouseX = e.clientX;
                this.mouseY = e.clientY;
                this.startSpringLoop();
            });

            this.containerEl.addEventListener('pointermove', (e) => {
                if (e.pointerType === 'touch') return;
                this.mouseX = e.clientX;
                this.mouseY = e.clientY;
                this.calculateTargetScales();
            });

            this.containerEl.addEventListener('pointerleave', (e) => {
                if (e.pointerType === 'touch') return;
                this.isHovering = false;
                this.mouseX = null;
                this.mouseY = null;
                this.resetTargetScales();
            });

            // Mobile Touch Spring Feedback (~0.96x press -> ~1.05x release -> 1.0x)
            this.items.forEach((btn, index) => {
                btn.addEventListener('touchstart', () => {
                    const state = this.itemStates[index];
                    if (state && state.iconWrapper) {
                        state.iconWrapper.style.transform = 'scale3d(0.95, 0.95, 1)';
                    }
                }, { passive: true });

                btn.addEventListener('touchend', () => {
                    const state = this.itemStates[index];
                    if (state && state.iconWrapper) {
                        state.iconWrapper.style.transform = 'scale3d(1.05, 1.05, 1)';
                        setTimeout(() => {
                            state.iconWrapper.style.transform = 'scale3d(1, 1, 1)';
                        }, 120);
                    }
                }, { passive: true });

                btn.addEventListener('touchcancel', () => {
                    const state = this.itemStates[index];
                    if (state && state.iconWrapper) {
                        state.iconWrapper.style.transform = 'scale3d(1, 1, 1)';
                    }
                }, { passive: true });
            });
        }

        updateLayout() {
            this.itemStates.forEach(state => {
                state.rect = state.btn.getBoundingClientRect();
            });
        }

        calculateTargetScales() {
            if (!this.isHovering || this.mouseX === null) {
                this.resetTargetScales();
                return;
            }

            this.itemStates.forEach(state => {
                if (!state.rect) state.rect = state.btn.getBoundingClientRect();
                const btnCenter = state.rect.left + (state.rect.width / 2);
                const distance = Math.abs(this.mouseX - btnCenter);

                if (distance < this.influenceRadius) {
                    // Fórmula Gaussiana macOS
                    const factor = Math.exp(-(distance * distance) / (2 * this.influenceRadius * this.influenceRadius));
                    state.targetScale = 1 + (this.maxMagnification - 1) * factor;
                } else {
                    state.targetScale = 1;
                }
            });
        }

        resetTargetScales() {
            this.itemStates.forEach(state => {
                state.targetScale = 1;
            });
        }

        startSpringLoop() {
            if (this.animFrameId) return;

            let lastTime = performance.now();

            const loop = (now) => {
                const dt = Math.min((now - lastTime) / 1000, 0.032); // Max 32ms cap
                lastTime = now;

                let isMoving = false;

                this.itemStates.forEach(state => {
                    // Spring Physics (Hooke's Law + Damping)
                    const displacement = state.currentScale - state.targetScale;
                    const springForce = -this.stiffness * displacement;
                    const dampingForce = -this.damping * state.velocity;
                    const acceleration = (springForce + dampingForce) / this.mass;

                    state.velocity += acceleration * dt;
                    state.currentScale += state.velocity * dt;

                    // Threshold de repouso
                    if (Math.abs(displacement) < 0.001 && Math.abs(state.velocity) < 0.001) {
                        state.currentScale = state.targetScale;
                        state.velocity = 0;
                    } else {
                        isMoving = true;
                    }

                    // Aplica transformação física suave sem alterar dimensões físicas do layout
                    if (state.iconWrapper) {
                        const translateY = (state.currentScale - 1) * -12; // Efeito elevação suave para cima
                        state.iconWrapper.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale3d(${state.currentScale.toFixed(4)}, ${state.currentScale.toFixed(4)}, 1)`;
                    }

                    // Posicionamento dinâmico do tooltip
                    if (state.tooltip && this.isDesktop) {
                        const showTooltip = this.isHovering && (state.targetScale > 1.25);
                        state.tooltip.style.opacity = showTooltip ? '1' : '0';
                        state.tooltip.style.transform = showTooltip
                            ? `translateX(-50%) translateY(${-28 - (state.currentScale - 1) * 16}px) scale(1)`
                            : 'translateX(-50%) translateY(-14px) scale(0.92)';
                    }
                });

                if (isMoving || this.isHovering) {
                    this.animFrameId = requestAnimationFrame(loop);
                } else {
                    this.animFrameId = null;
                }
            };

            this.animFrameId = requestAnimationFrame(loop);
        }
    }

    // Inicialização segura no DOMReady
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.dockEngine = new MacOsDockEngine();
        });
    } else {
        window.dockEngine = new MacOsDockEngine();
    }

})();
