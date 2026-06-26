import { installAgentConsole } from '../agent/agentConsole';
if (typeof window !== 'undefined') {
    installAgentConsole(window);
}
