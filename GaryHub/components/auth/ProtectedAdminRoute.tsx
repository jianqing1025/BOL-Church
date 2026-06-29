import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedAdminRouteProps {
    isAuthenticated: boolean;
    children: React.ReactElement;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({ isAuthenticated, children }) => {
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

export default ProtectedAdminRoute;