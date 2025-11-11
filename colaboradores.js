/**
 * js/modulos/colaboradores.js
 * ✅ CORREGIDO: Rutas de importación
 * Módulo para gestionar la lógica de la sección "Colaboradores".
 */

// --- Importaciones de Núcleo ---
// ✅ CORREGIDO: Cambiar '../../firebase-config.js' a '../firebase-config.js'
import { db } from '../firebase-config.js';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    query,
    updateDoc,
    getDoc,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ CORREGIDO: Ruta de importación de user-admin
import { createUserAccount } from '../user-admin.js';

// --- Elementos del DOM ---
let form, container, buttonShow, buttonCancel, buttonSave, errorDisplay;
let tableContainer;

// --- Modal de Edición ---
let editModal, editForm, editColaboradorId, editColaboradorEmail, editColaboradorNombre, editColaboradorRol;
let saveEditButton, editErrorDisplay;

/**
 * Función principal de inicialización del módulo de Colaboradores.
 */
export function initColaboradores(user, role) {
    console.log("Módulo de Colaboradores inicializado.");

    // Capturar elementos del DOM
    form = document.getElementById('new-colaborador-form');
    container = document.getElementById('new-colaborador-form-container');
    buttonShow = document.getElementById('show-colaborador-form-button');
    buttonCancel = document.getElementById('cancel-colaborador-form-button');
    buttonSave = document.getElementById('save-colaborador-button');
    errorDisplay = document.getElementById('form-colaborador-error');
    tableContainer = document.getElementById('colaboradores-table-container');

    // Capturar modal de edición
    editModal = document.getElementById('edit-colaborador-modal');
    editForm = document.getElementById('edit-colaborador-form');
    editColaboradorId = document.getElementById('edit-colaborador-id');
    editColaboradorEmail = document.getElementById('edit_colaborador_email');
    editColaboradorNombre = document.getElementById('edit_colaborador_nombre');
    editColaboradorRol = document.getElementById('edit_colaborador_rol');
    saveEditButton = document.getElementById('save-edit-colaborador-button');
    editErrorDisplay = document.getElementById('edit-colaborador-error');
    
    document.getElementById('edit-colaborador-modal').querySelector('.btn-secondary').addEventListener('click', () => editModal.classList.add('hidden'));

    // Configurar listeners
    buttonShow.addEventListener('click', () => toggleColaboradorForm(true));
    buttonCancel.addEventListener('click', () => toggleColaboradorForm(false));
    form.addEventListener('submit', handleSaveColaborador);
    editForm.addEventListener('submit', handleUpdateColaborador);

    // Cargar datos
    listenForColaboradores();

    // Listener de la tabla
    tableContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-colaborador-btn')) {
            const userId = e.target.dataset.id;
            openEditModal(userId);
        }
    });
}

/**
 * Muestra u oculta el formulario de nuevo colaborador.
 */
function toggleColaboradorForm(show) {
    if (show) {
        container.classList.remove('hidden');
        buttonShow.classList.add('hidden');
        form.reset();
        errorDisplay.textContent = '';
    } else {
        container.classList.add('hidden');
        buttonShow.classList.remove('hidden');
    }
}

/**
 * Escucha cambios en la colección de usuarios y renderiza la tabla.
 */
function listenForColaboradores() {
    const usersRef = collection(db, 'sfd_usuarios');
    const q = query(usersRef, limit(100));

    onSnapshot(q, (snapshot) => {
        let tableHtml = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rol</th>
                        <th scope="col" class="relative px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
        `;
        
        if (snapshot.empty) {
            tableHtml += `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No hay colaboradores registrados.</td></tr>`;
        } else {
            snapshot.forEach(doc => {
                const user = doc.data();
                if (user.rol === 'docente') return; 
                
                tableHtml += `
                    <tr data-id="${doc.id}">
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.nombre}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.email}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.rol}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button type="button" data-id="${doc.id}" class="edit-colaborador-btn text-blue-600 hover:text-blue-900">Editar</button>
                        </td>
                    </tr>
                `;
            });
        }

        tableHtml += `</tbody></table>`;
        tableContainer.innerHTML = tableHtml;

    }, (error) => {
        console.error("Error al escuchar colaboradores:", error);
        tableContainer.innerHTML = `<p class="text-center text-red-500">Error al cargar colaboradores.</p>`;
    });
}

/**
 * Maneja el guardado de un nuevo colaborador (Auth + Firestore).
 */
async function handleSaveColaborador(e) {
    e.preventDefault();
    buttonSave.disabled = true;
    buttonSave.textContent = 'Creando...';
    errorDisplay.textContent = '';

    const nombre = document.getElementById('colaborador_nombre').value;
    const email = document.getElementById('colaborador_email').value;
    const password = document.getElementById('colaborador_password').value;
    const rol = document.getElementById('colaborador_rol').value;

    try {
        if (!nombre || !email || !password || !rol) {
            throw new Error("Todos los campos son obligatorios.");
        }
        if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }

        const newUser = await createUserAccount(email, password);
        const newUid = newUser.uid;
        console.log('Cuenta de Auth creada, UID:', newUid);

        const userDocRef = doc(db, 'sfd_usuarios', newUid);
        await setDoc(userDocRef, {
            nombre: nombre,
            email: email,
            rol: rol
        });

        console.log('Datos de colaborador guardados en Firestore.');
        toggleColaboradorForm(false);

    } catch (error) {
        console.error('Error al crear colaborador:', error);
        let friendlyMessage = 'Error al crear el colaborador.';
        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = 'El correo electrónico ya está en uso.';
        } else if (error.code === 'auth/weak-password') {
            friendlyMessage = 'La contraseña es demasiado débil (mínimo 6 caracteres).';
        }
        errorDisplay.textContent = `Error: ${friendlyMessage}`;
    } finally {
        buttonSave.disabled = false;
        buttonSave.textContent = 'Crear Colaborador';
    }
}

/**
 * Abre el modal de edición y carga los datos del colaborador.
 */
async function openEditModal(userId) {
    editErrorDisplay.textContent = '';
    try {
        const userRef = doc(db, 'sfd_usuarios', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            throw new Error("No se pudo encontrar al colaborador.");
        }
        const user = userSnap.data();

        editColaboradorId.value = userId;
        editColaboradorEmail.value = user.email;
        editColaboradorNombre.value = user.nombre;
        editColaboradorRol.value = user.rol;
        
        editModal.classList.remove('hidden');

    } catch (error) {
        console.error("Error al abrir modal de edición de colaborador:", error);
        alert("Error: " + error.message);
    }
}

/**
 * Maneja el guardado de los cambios de un colaborador.
 */
async function handleUpdateColaborador(e) {
    e.preventDefault();
    saveEditButton.disabled = true;
    saveEditButton.textContent = 'Guardando...';
    editErrorDisplay.textContent = '';

    try {
        const userId = editColaboradorId.value;
        const nombre = editColaboradorNombre.value;
        const rol = editColaboradorRol.value;

        if (!nombre || !rol) {
            throw new Error("Nombre y Rol son obligatorios.");
        }
        
        const userRef = doc(db, 'sfd_usuarios', userId);
        await updateDoc(userRef, {
            nombre: nombre,
            rol: rol
        });
        
        console.log(`Colaborador ${userId} actualizado.`);
        editModal.classList.add('hidden');

    } catch (error) {
        console.error("Error al actualizar colaborador:", error);
        editErrorDisplay.textContent = `Error: ${error.message}`;
    } finally {
        saveEditButton.disabled = false;
        saveEditButton.textContent = 'Guardar Cambios';
    }
}