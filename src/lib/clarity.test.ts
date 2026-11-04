import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Clarity from '@microsoft/clarity';
import { initClarity } from './clarity';

vi.mock('@microsoft/clarity', () => ({ default: { init: vi.fn() } }));

describe('initClarity', () => {
    beforeEach(() => {
        vi.mocked(Clarity.init).mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('starts Clarity in a production build that has a project id', () => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_CLARITY_PROJECT_ID', 'project-id');
        initClarity();
        expect(Clarity.init).toHaveBeenCalledWith('project-id');
    });

    it('does nothing outside production, even with a project id', () => {
        vi.stubEnv('PROD', false);
        vi.stubEnv('VITE_CLARITY_PROJECT_ID', 'project-id');
        initClarity();
        expect(Clarity.init).not.toHaveBeenCalled();
    });

    it('does nothing in a production build without a project id', () => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_CLARITY_PROJECT_ID', '');
        initClarity();
        expect(Clarity.init).not.toHaveBeenCalled();
    });
});
