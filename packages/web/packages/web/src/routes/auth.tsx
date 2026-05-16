import { createRoute } from '@tanstack/react-router';
import { Login } from '../pages/auth/Login';
import { Register } from '../pages/auth/Register';
import { useNavigate } from '@tanstack/react-router';

export const LoginRoute = createRoute({
  path: '/login',
  component: LoginComponent,
});

function LoginComponent() {
  const navigate = useNavigate();
  return <Login onSwitchToRegister={() => navigate({ to: '/register' })} />;
}

export const RegisterRoute = createRoute({
  path: '/register',
  component: RegisterComponent,
});

function RegisterComponent() {
  const navigate = useNavigate();
  return <Register onSwitchToLogin={() => navigate({ to: '/login' })} />;
}
