import { Heart, Facebook, Instagram, Twitter, Mail } from 'lucide-react';
function Footer({ companyName }: any) {
    return (
        <div>
            <footer className="w-full bg-white border-t border-gray-50 pt-12 pb-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                    <div className="mb-6">
                        <h2 className="text-sm font-black text-[#1A3B5D] tracking-[0.3em] uppercase mb-2">{companyName}</h2>
                        <div className="h-0.5 w-8 bg-[#00A3E1] mx-auto rounded-sm"></div>
                    </div>
                    <div className="flex gap-8 mb-8 text-gray-400">
                        <a href="#" className="hover:text-[#00A3E1] transition-colors"><Instagram size={18} /></a>
                        <a href="#" className="hover:text-[#00A3E1] transition-colors"><Facebook size={18} /></a>
                        <a href="#" className="hover:text-[#00A3E1] transition-colors"><Twitter size={18} /></a>
                        <a href="#" className="hover:text-[#00A3E1] transition-colors"><Mail size={18} /></a>
                    </div>
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Made with <Heart size={12} className="inline text-red-500 fill-red-500" /> in India
                        </p>
                        <div className="pt-4 border-t border-gray-50 w-48 mx-auto">
                            <p className="text-[8px] font-medium text-gray-400 uppercase tracking-[0.15em]">© 2026 All Rights Reserved</p>
                            <p className="mt-1 text-[9px] font-black text-[#1A3B5D]/40 uppercase tracking-widest">
                                Powered by <a className="text-[#00A3E1] cursor-pointer" href='https://www.sellar.in' target='_blank'>sellar.in</a>
                            </p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default Footer
