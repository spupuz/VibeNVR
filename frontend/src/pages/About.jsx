import React from 'react';
import { ExternalLink, Github, Heart, Video, Star } from 'lucide-react';
import packageJson from '../../package.json';

export const About = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
            <div className="text-center space-y-4 mb-12">
                <div className="flex justify-center mb-6">
                    <img
                        src="/vibe_logo_variant_2.png"
                        alt="VibeNVR Logo"
                        className="h-32 w-auto drop-shadow-xl hover:scale-105 transition-transform duration-500"
                    />
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
                    VibeNVR
                </h1>
                <p className="text-xl text-muted-foreground font-light max-w-2xl mx-auto">
                    The Modern, Performant, and Beautiful Network Video Recorder
                </p>
                <div className="flex justify-center space-x-2">
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold uppercase tracking-wider">
                        v{packageJson.version} Beta
                    </span>
                    <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold uppercase tracking-wider">
                        Open Source
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-all duration-300">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                        <Video className="w-6 h-6 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Why VibeNVR?</h2>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                        I built VibeNVR because existing open-source solutions like MotionEye felt outdated, clunky, and hard to integrate with modern home automation stacks.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                        VibeNVR bridges the gap between powerful features and beautiful design. It's built with a modern stack (React, Python FastAPI, OpenCV) to be lightweight, fast, and a joy to use every day.
                    </p>
                </div>

                <div className="bg-card border border-border rounded-xl p-8 hover:shadow-lg transition-all duration-300 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="flex space-x-4">
                        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center animate-pulse">
                            <Heart className="w-8 h-8 text-yellow-500 fill-yellow-500" />
                        </div>
                        <div className="w-16 h-16 bg-gray-500/10 rounded-full flex items-center justify-center">
                            <Star className="w-8 h-8 text-gray-700 fill-current" />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold mb-2">Support the Project</h2>
                        <p className="text-muted-foreground mb-6">
                            If you love VibeNVR, consider giving it a Star on GitHub or buying me a coffee! Your support keeps the updates coming.
                        </p>

                        <div className="flex flex-col gap-4 justify-center items-center">
                            <a
                                href="https://github.com/spupuz/VibeNVR"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center space-x-2 bg-gray-900 text-white px-6 py-3 rounded-full font-bold hover:bg-gray-800 hover:scale-105 hover:shadow-xl transition-all duration-300 w-64"
                            >
                                <Github className="w-5 h-5" />
                                <span>Star on GitHub</span>
                            </a>
                            <a
                                href="https://www.buymeacoffee.com/spupuz"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center space-x-2 bg-[#FFDD00] text-black px-6 py-3 rounded-full font-bold hover:bg-[#FFEA00] hover:scale-105 hover:shadow-xl transition-all duration-300 w-64"
                            >
                                <img
                                    src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg"
                                    alt="Buy me a coffee"
                                    className="w-5 h-5"
                                />
                                <span>Buy me a coffee</span>
                            </a>
                            <a
                                href="https://www.producthunt.com/products/vibenvr?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-vibenvr"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center transition-all duration-300 hover:scale-105 rounded-lg overflow-hidden"
                            >
                                <img
                                    src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1070162&theme=light&t=1769727454865"
                                    alt="VibeNVR - Simple, privacy-respecting local NVR | Product Hunt"
                                    width="250"
                                    height="54"
                                    className="w-[250px] h-[54px]"
                                />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4 border-b border-border pb-2">Technical Credits & Stack</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                    <div className="flex flex-col space-y-1">
                        <span className="font-medium text-foreground">Backend</span>
                        <span>Python FastAPI</span>
                        <span>SQLAlchemy</span>
                        <span>PostgreSQL</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                        <span className="font-medium text-foreground">Frontend</span>
                        <span>React + Vite</span>
                        <span>TailwindCSS</span>
                        <span>Lucide Icons</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                        <span className="font-medium text-foreground">Loop</span>
                        <span>OpenCV</span>
                        <span>FFmpeg</span>
                        <span>Docker</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                        <span className="font-medium text-foreground">Author</span>
                        <span>Alessandro Belloni</span>
                        <a href="https://github.com/spupuz" className="flex items-center space-x-1 text-primary hover:underline">
                            <Github className="w-3 h-3" />
                            <span>@spupuz</span>
                        </a>
                    </div>
                </div>
            </div>

            <div className="text-center text-xs text-muted-foreground mt-8 px-4">
                <p className="font-mono uppercase opacity-70">
                    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
                </p>
            </div>
        </div>
    );
};
