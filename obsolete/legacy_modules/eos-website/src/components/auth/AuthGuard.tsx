import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthGuardProps {
    children: ReactNode;
}

// Tempo de expiração da sessão (24 horas)
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function isAuthenticated(): boolean {
    const authenticated = localStorage.getItem('eos_authenticated');
    const authTime = localStorage.getItem('eos_auth_time');

    if (!authenticated || !authTime) return false;

    // Verificar se a sessão expirou
    const elapsed = Date.now() - parseInt(authTime);
    if (elapsed > SESSION_EXPIRY_MS) {
        logout();
        return false;
    }

    return true;
}

export function logout(): void {
    localStorage.removeItem('eos_authenticated');
    localStorage.removeItem('eos_auth_time');
}

export function AuthGuard({ children }: AuthGuardProps) {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (!isAuthenticated()) {
            navigate('/login');
        } else {
            setChecking(false);
        }
    }, [navigate]);

    if (checking) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 mb-4 animate-pulse">
                        <span className="text-3xl">🎯</span>
                    </div>
                    <p className="text-slate-400">Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
