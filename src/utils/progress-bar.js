// src/utils/progress-bar.js

/**
 * Lightweight, zero-dependency interactive terminal progress bar
 */
class ProgressBar {
    /**
     * @param {object} [options={}]
     * @param {number} [options.width=20] Width of progress bar in characters
     * @param {boolean} [options.isTTY] Explicit TTY override
     */
    constructor(options = {}) {
        this.width = options.width || 20;
        this.current = 0;
        this.isTTY = options.isTTY !== undefined ? options.isTTY : Boolean(process.stdout.isTTY);
        this.startTime = Date.now();
        this.lastRenderTime = 0;
        this.lastPercent = -1;
        this.stopped = false;
    }

    /**
     * Updates progress bar to a specific percentage and status message
     * @param {number} percent 0 to 100
     * @param {string} [message=''] Current action description
     */
    update(percent, message = '') {
        if (this.stopped) return;
        this.current = Math.min(100, Math.max(0, Math.round(percent)));

        const now = Date.now();
        const elapsed = ((now - this.startTime) / 1000).toFixed(1);

        // Non-interactive mode (pipes, CI, test environments)
        if (!this.isTTY) {
            if (this.current !== this.lastPercent && (this.current % 25 === 0 || this.current === 100)) {
                this.lastPercent = this.current;
                // Optional non-TTY milestones
            }
            return;
        }

        // Throttle updates slightly to 30ms to prevent terminal flicker
        if (now - this.lastRenderTime < 30 && this.current !== 100 && this.current === this.lastPercent) {
            return;
        }
        this.lastRenderTime = now;
        this.lastPercent = this.current;

        const filledLen = Math.round((this.current / 100) * this.width);
        const emptyLen = Math.max(0, this.width - filledLen);

        const bar = '█'.repeat(filledLen) + '░'.repeat(emptyLen);
        const pctStr = `${String(this.current).padStart(3)}%`;

        const termWidth = process.stdout.columns || 80;
        let maxMsgLen = termWidth - this.width - 20;
        if (maxMsgLen < 15) maxMsgLen = 15;

        let displayMsg = message;
        if (displayMsg.length > maxMsgLen) {
            displayMsg = displayMsg.slice(0, maxMsgLen - 3) + '...';
        }

        const output = `\r\x1b[36m[${bar}]\x1b[0m \x1b[1m${pctStr}\x1b[0m \x1b[90m•\x1b[0m ${displayMsg} \x1b[90m(${elapsed}s)\x1b[0m\x1b[K`;
        process.stdout.write(output);
    }

    /**
     * Clears progress line when done
     */
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        if (this.isTTY) {
            process.stdout.write('\r\x1b[K');
        }
    }
}

module.exports = {
    ProgressBar
};
