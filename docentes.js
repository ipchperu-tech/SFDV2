/**
 * js/modulos/docentes.js
 * ✅ CORREGIDO: Rutas de importación
 * Módulo para gestionar la lógica de la sección "Docentes".
 */

// --- Importaciones de Núcleo ---
// ✅ CORREGIDO: Cambiar '../../firebase-config.js' a '../firebase-config.js'
import { db } from '../firebase-config.js';
import {
    collection,
    doc,
    addDoc,
    onSnapshot,
    query,
    setDoc,
    getDoc,
    updateDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ✅ CORREGIDO: Importar la función de creación de cuenta de Auth
import { createUserAccount } from '../user-admin.js';

// --- Estado del Módulo ---
let docenteCache = new Map();

// --- Elementos del DOM ---
let form, container, buttonShow, buttonCancel, buttonSave, errorDisplay;
let tableContainer;
let crearLoginCheckbox, passwordFieldsContainer, passwordInput, confirmPasswordInput;

// --- Modal de Edición ---
let editModal, editForm, editDocenteId, editDocenteNombre, editDocenteEmail, editDocenteDNI;
let saveEditButton, editErrorDisplay;

/**
 * Función principal de inicialización del módulo de Docentes.
 */
export function initDocentes(user, role) {
    console.log("Módulo de Docentes inicializado.");
    
    // Capturar elementos del DOM
    form = document.getElementById('new-docente-form');
    container = document.getElementById('new-docente-form-container');
    buttonShow = document.getElementById('show-docente-form-button');
    buttonCancel = document.getElementById('cancel-docente-form-button');
    buttonSave = document.getElementById('save-docente-button');
    errorDisplay = document.getElementById('form-docente-error');
    tableContainer = document.getElementById('docentes-table-container');

    // Campos para crear login
    crearLoginCheckbox = document.getElementById('docente_crear_login');
    passwordFieldsContainer = document.getElementById('docente_password_fields');
    passwordInput = document.getElementById('docente_password');
    confirmPasswordInput = document.getElementById('docente_confirm_password');

    // Capturar elementos del modal de edición
    editModal = document.getElementById('edit-docente-modal');
    editForm = document.getElementById('edit-docente-form');
    editDocenteId = document.getElementById('edit-docente-id');
    editDocenteNombre = document.getElementById('edit_docente_nombre');
    editDocenteEmail = document.getElementById('edit_docente_email');
    editDocenteDNI = document.getElementById('edit_docente_dni');
    saveEditButton = document.getElementById('save-edit-docente-button');
    editErrorDisplay = document.getElementById('edit-docente-error');
    
    document.getElementById('edit-docente-modal').querySelector('.btn-secondary').addEventListener('click', () => editModal.classList.add('hidden'));

    // Configurar listeners
    buttonShow.addEventListener('click', () => toggleDocenteForm(true));
    buttonCancel.addEventListener('click', () => toggleDocenteForm(false));
    
    crearLoginCheckbox.addEventListener('change', () => {
        const isChecked = crearLoginCheckbox.checked;
        passwordFieldsContainer.classList.toggle('hidden', !isChecked);
        passwordInput.required = isChecked;
        confirmPasswordInput.required = isChecked;
    });
    
    form.addEventListener('submit', handleSaveDocente);
    editForm.addEventListener('submit', handleUpdateDocente);

    // Cargar datos
    listenForDocentes();

    // Listener de la tabla para Edición
    tableContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-docente-btn')) {
            const docenteId = e.target.dataset.id;
            openEditModal(docenteId);
        }
    });
}

/**
 * Muestra u oculta el formulario de nuevo docente.
 */
function toggleDocenteForm(show) {
    if (show) {
        container.classList.remove('hidden');
        buttonShow.classList.add('hidden');
        form.reset();
        errorDisplay.textContent = '';
        passwordFieldsContainer.classList.add('hidden');
    } else {
        container.classList.add('hidden');
        buttonShow.classList.remove('hidden');
    }
}

/**
 * Carga el caché de docentes y renderiza la tabla.
 */
async function loadDocenteCacheAndRenderTable() {
    const docentesRef = collection(db, 'sfd_docentes');
    const q = query(docentesRef);
    const snapshot = await getDocs(q);

    docenteCache.clear();
    let usersToQuery = [];

    snapshot.forEach(docSnapshot => { 
        const docente = { id: docSnapshot.id, ...docSnapshot.data() };
        docenteCache.set(docSnapshot.id, docente);
        if (docente.user_uid) {
            usersToQuery.push(getDoc(doc(db, 'sfd_usuarios', docente.user_uid)));
        }
    });

    const userSnapshots = await Promise.all(usersToQuery);
    const userCache = new Map();
    userSnapshots.forEach(userDoc => {
        if (userDoc.exists()) {
            userCache.set(userDoc.id, {
                email: userDoc.data().email,
                dni: userDoc.data().dni
            });
        }
    });

    renderDocentesTable(userCache);
}

/**
 * Escucha cambios en la colección de docentes y renderiza la tabla.
 */
function listenForDocentes() {
    const docentesRef = collection(db, 'sfd_docentes');
    const q = query(docentesRef);

    onSnapshot(q, (snapshot) => {
        loadDocenteCacheAndRenderTable();
    }, (error) => {
        console.error("Error al escuchar docentes:", error);
        tableContainer.innerHTML = `<p class="text-center text-red-500">Error al cargar docentes.</p>`;
    });
}

/**
 * Renderiza la tabla de docentes.
 */
function renderDocentesTable(userCache) {
    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email (Contacto)</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">DNI (Login)</th>
                    <th scope="col" class="relative px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
    `;
    
    if (docenteCache.size === 0) {
        tableHtml += `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No hay docentes registrados.</td></tr>`;
    } else {
        docenteCache.forEach(docente => {
            const userData = userCache.get(docente.user_uid);
            const loginIdentifier = userData ? (userData.dni || userData.email) : 'Ninguna';
            
            tableHtml += `
                <tr data-id="${docente.id}">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${docente.nombre_completo}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${docente.email}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${loginIdentifier}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button type="button" data-id="${docente.id}" class="edit-docente-btn text-blue-600 hover:text-blue-900">Editar</button>
                    </td>
                </tr>
            `;
        });
    }
    
    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;
}

/**
 * Maneja el guardado de un nuevo docente.
 */
async function handleSaveDocente(e) {
    e.preventDefault();
    buttonSave.disabled = true;
    buttonSave.textContent = 'Guardando...';
    errorDisplay.textContent = '';

    const nombre = document.getElementById('docente_nombre_completo').value;
    const email = document.getElementById('docente_email').value;
    const dni = document.getElementById('docente_dni').value;
    const crearLogin = crearLoginCheckbox.checked;

    try {
        if (!nombre || !email) {
            throw new Error('Nombre y Email de contacto son campos obligatorios.');
        }

        if (!dni) {
            throw new Error('El DNI es obligatorio para todos los docentes.');
        }

        let userUid = null;
        
        if (crearLogin) {
            if (!dni) {
                throw new Error('El DNI es obligatorio para crear una cuenta de login.');
            }
            
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (password !== confirmPassword) {
                throw new Error('Las contraseñas no coinciden.');
            }
            if (password.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres.');
            }
            
            const newUser = await createUserAccount(email, password);
            userUid = newUser.uid;
            console.log('Cuenta de Auth para docente creada, UID:', userUid);

            const userDocRef = doc(db, 'sfd_usuarios', userUid);
            await setDoc(userDocRef, {
                nombre: nombre,
                email: email,
                dni: dni,
                rol: 'docente'
            });
            console.log('Datos de docente guardados en sfd_usuarios.');
        }
        
        const docenteData = {
            nombre_completo: nombre,
            email: email,
            dni: dni || null,
            user_uid: userUid,
        };
        
        const docentesRef = collection(db, 'sfd_docentes');
        const docenteDocRef = await addDoc(docentesRef, docenteData);

        if (userUid) {
            await updateDoc(doc(db, 'sfd_usuarios', userUid), {
                docente_id: docenteDocRef.id
            });
            console.log('Referencia docente_id agregada a sfd_usuarios');
        }

        console.log('Docente registrado con éxito:', docenteData.nombre_completo);
        toggleDocenteForm(false);

    } catch (error) {
        console.error('Error al guardar el docente:', error);
        let friendlyMessage = error.message;
        if (error.code === 'auth/email-already-in-use') {
            friendlyMessage = 'El correo electrónico ya está en uso. No se puede crear la cuenta de login.';
        }
        errorDisplay.textContent = `Error: ${friendlyMessage}`;
    } finally {
        buttonSave.disabled = false;
        buttonSave.textContent = 'Guardar Docente';
    }
}

/**
 * Abre el modal de edición y carga los datos del docente.
 */
async function openEditModal(docenteId) {
    editErrorDisplay.textContent = '';
    try {
        const docente = docenteCache.get(docenteId);
        if (!docente) {
            throw new Error("No se pudo encontrar el docente en el caché.");
        }

        editDocenteId.value = docenteId;
        editDocenteNombre.value = docente.nombre_completo;
        editDocenteEmail.value = docente.email;
        editDocenteDNI.value = docente.dni || '';
        
        editModal.classList.remove('hidden');

    } catch (error) {
        console.error("Error al abrir modal de edición de docente:", error);
        alert("Error: " + error.message);
    }
}

/**
 * Maneja el guardado de los cambios de un docente.
 */
async function handleUpdateDocente(e) {
    e.preventDefault();
    saveEditButton.disabled = true;
    saveEditButton.textContent = 'Guardando...';
    editErrorDisplay.textContent = '';

    try {
        const docenteId = editDocenteId.value;
        const nombre = editDocenteNombre.value;
        const email = editDocenteEmail.value;
        const dni = editDocenteDNI.value;

        if (!nombre || !email) {
            throw new Error("Nombre y Email son obligatorios.");
        }
        
        const docenteRef = doc(db, 'sfd_docentes', docenteId);
        await updateDoc(docenteRef, {
            nombre_completo: nombre,
            email: email,
            dni: dni || null
        });

        const docenteData = docenteCache.get(docenteId);
        if (docenteData && docenteData.user_uid) {
            const userRef = doc(db, 'sfd_usuarios', docenteData.user_uid);
            await updateDoc(userRef, {
                nombre: nombre,
                email: email,
                dni: dni || null
            });
        }

        console.log(`Docente ${docenteId} actualizado.`);
        editModal.classList.add('hidden');

    } catch (error) {
        console.error("Error al actualizar docente:", error);
        editErrorDisplay.textContent = `Error: ${error.message}`;
    } finally {
        saveEditButton.disabled = false;
        saveEditButton.textContent = 'Guardar Cambios';
    }
}