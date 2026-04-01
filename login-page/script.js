document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const submitBtn = document.getElementById('submitBtn');

    // Show error message and animation
    const showError = (input, errorElement, message) => {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        input.style.borderColor = 'var(--error-color)';
        
        // Trigger reflow to restart animation
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
    };

    // Clear error message
    const clearError = (input, errorElement) => {
        errorElement.classList.remove('show');
        input.style.borderColor = '';
        setTimeout(() => {
            if (!errorElement.classList.contains('show')) {
                errorElement.textContent = '';
            }
        }, 200); // Wait for transition
    };

    // Real-time validation
    emailInput.addEventListener('input', () => {
        if (emailInput.value.trim() !== '') {
            clearError(emailInput, emailError);
        }
    });

    passwordInput.addEventListener('input', () => {
        if (passwordInput.value !== '') {
            clearError(passwordInput, passwordError);
        }
    });

    // Form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let isValid = true;
        const emailVal = emailInput.value.trim();
        const passwordVal = passwordInput.value;

        // Reset previous errors
        clearError(emailInput, emailError);
        clearError(passwordInput, passwordError);

        // Validate Email
        if (!emailVal) {
            showError(emailInput, emailError, 'Email address is required');
            isValid = false;
        }

        // Validate Password
        if (!passwordVal) {
            showError(passwordInput, passwordError, 'Password is required');
            isValid = false;
        }

        // Submit form if valid
        if (isValid) {
            // Set loading state
            submitBtn.classList.add('loading');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';
            submitBtn.disabled = true;

            // Simulate network request
            setTimeout(() => {
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = 'Success!';
                submitBtn.style.backgroundColor = '#10b981'; // Green success color
                
                setTimeout(() => {
                    // Reset everything
                    submitBtn.style.backgroundColor = '';
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    loginForm.reset();
                    alert('Login successful! Welcome back.');
                }, 1000);
            }, 1500);
        }
    });
});
