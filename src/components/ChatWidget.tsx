import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { sendMessage, type ChatMessage } from "@/lib/geminiApi";
import "./ChatWidget.css";

const INITIAL_MESSAGE: ChatMessage = {
    role: "assistant",
    content: "👋 Olá! Sou o EOS Assistant. Posso ajudar com informações sobre criptomoedas em tempo real.\n\nExperimente perguntar:\n• \"Qual o preço do Bitcoin?\"\n• \"Como está o Ethereum hoje?\"\n• \"Me fale sobre a Solana\"",
};

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();

        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput("");

        // Add user message
        const newMessages: ChatMessage[] = [
            ...messages,
            { role: "user", content: userMessage },
        ];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            // Get AI response
            const response = await sendMessage(messages, userMessage);

            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: response },
            ]);
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "❌ Erro ao processar sua mensagem. Tente novamente." },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="chat-widget">
            {/* Chat Window */}
            <div className={`chat-window ${isOpen ? "chat-window-open" : ""}`}>
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-info">
                        <div className="chat-avatar">
                            <MessageCircle size={18} />
                        </div>
                        <div>
                            <h3 className="chat-title">EOS Assistant</h3>
                            <span className="chat-subtitle">Powered by Gemini AI</span>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="chat-close-btn"
                        aria-label="Fechar chat"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Messages */}
                <div className="chat-messages">
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`chat-message ${message.role === "user" ? "chat-message-user" : "chat-message-assistant"
                                }`}
                        >
                            <div className="chat-message-content">
                                {message.content.split("\n").map((line, i) => (
                                    <p key={i}>{line || <br />}</p>
                                ))}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="chat-message chat-message-assistant">
                            <div className="chat-message-content chat-typing">
                                <Loader2 className="animate-spin" size={16} />
                                <span>Analisando...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="chat-input-container">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pergunte sobre qualquer cripto..."
                        className="chat-input"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="chat-send-btn"
                        aria-label="Enviar mensagem"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`chat-toggle-btn ${isOpen ? "chat-toggle-open" : ""}`}
                aria-label={isOpen ? "Fechar chat" : "Abrir chat"}
            >
                {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
            </button>
        </div>
    );
}
