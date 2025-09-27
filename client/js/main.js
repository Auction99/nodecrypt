// ===== 密码保护：前端哈希版 =====
const PASSWORD_HASH = "c7ad44cbad762a5da0a452f9e854fdc1e0e7a52a38015f23f3eab1d80b931dd4"; // "hndmek" 的 SHA-256

async function checkPasswordAndInit() {
	// 检查是否已验证
	if (localStorage.getItem('pwd_ok') === '1') {
		await initializeApp();
		return;
	}

	const overlay = document.getElementById('password-overlay');
	if (!overlay) {
		await initializeApp(); // 安全兜底
		return;
	}

	overlay.style.display = 'flex';

	const input = document.getElementById('password-input');
	const btn = document.getElementById('password-submit');
	const error = document.getElementById('password-error');

	const sha256 = async (str) => {
		const buf = new TextEncoder().encode(str);
		const hash = await crypto.subtle.digest('SHA-256', buf);
		return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
	};

	const verify = async () => {
		const hash = await sha256(input.value);
		if (hash === PASSWORD_HASH) {
			localStorage.setItem('pwd_ok', '1');
			overlay.style.display = 'none';
			await initializeApp();
		} else {
			error.style.display = 'block';
			input.value = '';
			input.focus();
		}
	};

	btn.onclick = verify;
	input.onkeypress = (e) => {
		if (e.key === 'Enter') verify();
	};
	input.focus();
}

// ===== 原有初始化逻辑（封装）=====
async function initializeApp() {
	// 你的所有原有代码从这里开始 ↓↓↓

	// 导入模块（保持不变）
	import('./NodeCrypt.js');
	const {
		setupFileSend,
		handleFileMessage,
		downloadFile
	} = await import('./util.file.js');
	const { setupImagePaste } = await import('./util.image.js');
	const { setupEmojiPicker } = await import('./util.emoji.js');
	const {
		openSettingsPanel,
		closeSettingsPanel,
		initSettings,
		notifyMessage
	} = await import('./util.settings.js');
	const { t, updateStaticTexts } = await import('./util.i18n.js');
	const { initTheme } = await import('./util.theme.js');
	const { $, $id, removeClass } = await import('./util.dom.js');
	const {
		roomsData,
		activeRoomIndex,
		joinRoom
	} = await import('./room.js');
	const {
		addMsg,
		addOtherMsg,
		addSystemMsg,
		setupImagePreview,
		setupInputPlaceholder,
		autoGrowInput
	} = await import('./chat.js');
	const {
		renderUserList,
		renderMainHeader,
		setupMoreBtnMenu,
		preventSpaceInput,
		loginFormHandler,
		openLoginModal,
		setupTabs,
		autofillRoomPwd,
		generateLoginForm,
		initLoginForm,
		initFlipCard
	} = await import('./ui.js');

	window.config = {
		wsAddress: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
		debug: true
	};

	initSettings();
	updateStaticTexts();

	window.addSystemMsg = addSystemMsg;
	window.addOtherMsg = addOtherMsg;
	window.joinRoom = joinRoom;
	window.notifyMessage = notifyMessage;
	window.setupEmojiPicker = setupEmojiPicker;
	window.handleFileMessage = handleFileMessage;
	window.downloadFile = downloadFile;

	// DOMContentLoaded 逻辑
	setTimeout(() => {
		document.body.classList.remove('preload');
	}, 300);
	
	initLoginForm();

	const loginForm = $id('login-form');
	if (loginForm) {
		loginForm.addEventListener('submit', loginFormHandler(null));
	}

	const joinBtn = $('.join-room');
	if (joinBtn) {
		joinBtn.onclick = openLoginModal;
	}

	preventSpaceInput($id('userName'));
	preventSpaceInput($id('roomName'));
	preventSpaceInput($id('password'));
	
	initFlipCard();
	autofillRoomPwd();
	setupInputPlaceholder();
	setupMoreBtnMenu();
	setupImagePreview();
	setupEmojiPicker();
	initTheme();
	
	const settingsBtn = $id('settings-btn');
	if (settingsBtn) {
		settingsBtn.onclick = (e) => {
			e.stopPropagation();
			openSettingsPanel();
		};
	}

	const settingsBackBtn = $id('settings-back-btn');
	if (settingsBackBtn) {
		settingsBackBtn.onclick = (e) => {
			e.stopPropagation();
			closeSettingsPanel();
		};
	}

	const input = document.querySelector('.input-message-input');
	const imagePasteHandler = setupImagePaste('.input-message-input');
	
	if (input) {
		input.focus();
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});
	}

	function sendMessage() {
		const text = input.innerText.trim();
		const images = imagePasteHandler ? imagePasteHandler.getCurrentImages() : [];

		if (!text && images.length === 0) return;
		const rd = roomsData[activeRoomIndex];
		
		if (rd && rd.chat) {
			if (images.length > 0) {
				const messageContent = {
					text: text || '',
					images: images
				};

				if (rd.privateChatTargetId) {
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: 'image_private',
							d: messageContent
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						rd.chat.sendMessage(encryptedMessageForServer);
						addMsg(messageContent, false, 'image_private');
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					rd.chat.sendChannelMessage('image', messageContent);
					addMsg(messageContent, false, 'image');
				}
				
				imagePasteHandler.clearImages();
			} else if (text) {
				if (rd.privateChatTargetId) {
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: 'text_private',
							d: text
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						rd.chat.sendMessage(encryptedMessageForServer);
						addMsg(text, false, 'text_private');
					} else {
						addSystemMsg(`${t('system.private_message_failed', 'Cannot send private message to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					rd.chat.sendChannelMessage('text', text);
					addMsg(text);
				}
			}
			
			input.innerHTML = '';
			if (imagePasteHandler && typeof imagePasteHandler.refreshPlaceholder === 'function') {
				imagePasteHandler.refreshPlaceholder();
			}
			autoGrowInput();
		}
	}
	
	const sendButton = document.querySelector('.send-message-btn');
	if (sendButton) {
		sendButton.addEventListener('click', sendMessage);
	}
	
	setupFileSend({
		inputSelector: '.input-message-input',
		attachBtnSelector: '.chat-attach-btn',
		fileInputSelector: '.new-message-wrapper input[type="file"]',
		onSend: (message) => {
			const rd = roomsData[activeRoomIndex];
			if (rd && rd.chat) {
				const userName = rd.myUserName || '';
				const msgWithUser = { ...message, userName };
				if (rd.privateChatTargetId) {
					const targetClient = rd.chat.channel[rd.privateChatTargetId];
					if (targetClient && targetClient.shared) {
						const clientMessagePayload = {
							a: 'm',
							t: msgWithUser.type + '_private',
							d: msgWithUser
						};
						const encryptedClientMessage = rd.chat.encryptClientMessage(clientMessagePayload, targetClient.shared);
						const serverRelayPayload = {
							a: 'c',
							p: encryptedClientMessage,
							c: rd.privateChatTargetId
						};
						const encryptedMessageForServer = rd.chat.encryptServerMessage(serverRelayPayload, rd.chat.serverShared);
						rd.chat.sendMessage(encryptedMessageForServer);
						if (msgWithUser.type === 'file_start') {
							addMsg(msgWithUser, false, 'file_private');
						}
					} else {
						addSystemMsg(`${t('system.private_file_failed', 'Cannot send private file to')} ${rd.privateChatTargetName}. ${t('system.user_not_connected', 'User might not be fully connected.')}`)
					}
				} else {
					rd.chat.sendChannelMessage(msgWithUser.type, msgWithUser);
					if (msgWithUser.type === 'file_start') {
						addMsg(msgWithUser, false, 'file');
					}
				}
			}
		}
	});

	const isMobile = () => window.innerWidth <= 768;
	renderMainHeader();
	renderUserList();
	setupTabs();

	const roomList = $id('room-list');
	const sidebar = $id('sidebar');
	const rightbar = $id('rightbar');
	const sidebarMask = $id('mobile-sidebar-mask');
	const rightbarMask = $id('mobile-rightbar-mask');

	if (roomList) {
		roomList.addEventListener('click', () => {
			if (isMobile()) {
				sidebar?.classList.remove('mobile-open');
				sidebarMask?.classList.remove('active');
			}
		});
	}

	const memberTabs = $id('member-tabs');
	if (memberTabs) {
		memberTabs.addEventListener('click', () => {
			if (isMobile()) {
				removeClass(rightbar, 'mobile-open');
				removeClass(rightbarMask, 'active');
			}
		});
	}
}

// 全局拖拽逻辑（保持不变）
let dragCounter = 0;
let hasTriggeredAttach = false;

window.addEventListener('fileUploadModalClosed', () => {
	hasTriggeredAttach = false;
});

document.addEventListener('dragenter', (e) => {
	dragCounter++;
	if (!hasTriggeredAttach && e.dataTransfer.items.length > 0) {
		for (let item of e.dataTransfer.items) {
			if (item.kind === 'file') {
				const attachBtn = document.querySelector('.chat-attach-btn');
				if (attachBtn) {
					attachBtn.click();
					hasTriggeredAttach = true;
				}
				break;
			}
		}
	}
});

document.addEventListener('dragleave', (e) => {
	dragCounter--;
	if (dragCounter === 0) {
		hasTriggeredAttach = false;
	}
});

document.addEventListener('dragover', (e) => {
	e.preventDefault();
});

document.addEventListener('drop', (e) => {
	e.preventDefault();
	dragCounter = 0;
	hasTriggeredAttach = false;
});

// 语言切换
window.addEventListener('languageChange', (event) => {
	updateStaticTexts();
});

// 启动密码验证
document.addEventListener('DOMContentLoaded', checkPasswordAndInit);
