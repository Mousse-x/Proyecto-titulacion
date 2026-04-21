import { useState } from "react";
import api from "../services/api";

export default function Register() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");

  const firstName = form.firstName.trim();
  const lastName  = form.lastName.trim();

  if (!firstName || !lastName) {
    setError("El nombre y el apellido son obligatorios.");
    return;
  }

  if (form.password !== form.confirmPassword) {
    setError("Las contraseñas no coinciden.");
    return;
  }

  try {
    const payload = {
      fullName: `${firstName} ${lastName}`,
      email: form.email,
      password: form.password,
    };
    const response = await api.post("/api/register/", payload);
    setMessage(response.data.message);
  } catch (err) {
    setError(err.response?.data?.error || "Error al registrar el usuario.");
  }
};

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Crear cuenta</h1>
        <p style={styles.subtitle}>Registro de usuario consultor</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Nombre(s)</label>
          <input
            type="text"
            name="firstName"
            placeholder="Ej. Juan Carlos"
            value={form.firstName}
            onChange={handleChange}
            style={styles.input}
            required
          />

          <label style={styles.label}>Apellido(s)</label>
          <input
            type="text"
            name="lastName"
            placeholder="Ej. Pérez García"
            value={form.lastName}
            onChange={handleChange}
            style={styles.input}
            required
          />

          <label style={styles.label}>Correo electrónico</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            style={styles.input}
            required
          />

          <label style={styles.label}>Contraseña</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            style={styles.input}
            required
          />

          <label style={styles.label}>Confirmar contraseña</label>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            style={styles.input}
            required
          />

          <button type="submit" style={styles.button}>
            Registrarse
          </button>

          {error && <p style={styles.error}>{error}</p>}
          {message && <p style={styles.success}>{message}</p>}
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f7fb",
    padding: "24px",
  },
  card: {
    width: "100%",
    maxWidth: "430px",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    marginBottom: "8px",
    fontSize: "28px",
  },
  subtitle: {
    marginTop: 0,
    marginBottom: "24px",
    color: "#666",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
  },
  input: {
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid #d0d7e2",
    fontSize: "15px",
    outline: "none",
  },
  button: {
    marginTop: "8px",
    padding: "12px 16px",
    border: "none",
    borderRadius: "10px",
    background: "#1d4ed8",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
  error: {
    color: "#b91c1c",
    marginTop: "8px",
  },
  success: {
    color: "#15803d",
    marginTop: "8px",
  },
};